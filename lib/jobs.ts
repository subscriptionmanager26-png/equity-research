import {
  ACTIVE_JOB_SCAN_LIMIT,
  capJobEvents,
  claimSettleSlot,
  countRecentJobs,
  DASHBOARD_JOB_LIMIT,
  getJobIdForAgent,
  isJobsMigrated,
  jobsBackendIsRedis,
  listRecentJobRecords,
  markJobsMigratedCached,
  MAX_JOB_EVENTS,
  migrateJobsFromBlobIfNeeded,
  readJobRecord,
  releaseSettleSlot,
  writeJobRecord,
} from "@/lib/job-store";
import { claimSlackInboundMessage, getStore, kvEnabled, updateStore } from "@/lib/store";
import type {
  InboundMessage,
  Job,
  JobEvent,
  JobSource,
  SlackThreadRef,
  TelegramChat,
} from "@/lib/types";

const MAX_JOBS_FILE = 100;
const MAX_SLACK_EVENT_IDS = 500;

function pushJobEvent(job: Job, event: Omit<JobEvent, "at"> & { at?: string }, at: string) {
  job.events = job.events ?? [];
  job.events.unshift({
    at: event.at ?? at,
    type: event.type,
    detail: event.detail,
  });
  if (job.events.length > MAX_JOB_EVENTS) {
    job.events = job.events.slice(0, MAX_JOB_EVENTS);
  }
}

let migrationPromise: Promise<void> | undefined;
let migrationCooldownUntil = 0;

async function ensureJobMigration() {
  if (!kvEnabled()) return;
  if (await isJobsMigrated()) return;
  if (Date.now() < migrationCooldownUntil) return;
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const data = await getStore();
      await migrateJobsFromBlobIfNeeded(data.jobs);
      markJobsMigratedCached();
      if (data.jobs?.length || data.processedSlackMessages?.length) {
        await updateStore((store) => {
          store.jobs = [];
          // Redis NX keys are the dedupe source of truth; drop the blob copy.
          store.processedSlackMessages = [];
        });
      }
    })()
      .catch((error) => {
        migrationCooldownUntil = Date.now() + 60_000;
        console.error("[relay] Job migration failed", error);
      })
      .finally(() => {
        migrationPromise = undefined;
      });
  }
  await migrationPromise;
}

export async function getJobCount(): Promise<number> {
  await ensureJobMigration();
  if (jobsBackendIsRedis()) {
    return countRecentJobs();
  }
  const data = await getStore();
  return data.jobs.length;
}

export function newJobId() {
  return `job_${crypto.randomUUID()}`;
}

export function slackThreadKey(channelId: string, threadTs: string) {
  return `${channelId}:${threadTs}`;
}

function buildJob(input: {
  source: JobSource;
  prompt: string;
  chatId?: number;
  username?: string;
  displayName?: string;
  slackChannelId?: string;
  slackThreadTs?: string;
  slackTeamId?: string;
  slackUserId?: string;
  slackMessageTs?: string;
  threadContext?: string;
  files?: Job["files"];
  followUpAgentId?: string;
  telegramInboundMessageId?: number;
  telegramAckMessageId?: number;
}): Job {
  const now = new Date().toISOString();
  return {
    id: newJobId(),
    createdAt: now,
    updatedAt: now,
    source: input.source,
    chatId: input.chatId,
    username: input.username,
    displayName: input.displayName,
    slackChannelId: input.slackChannelId,
    slackThreadTs: input.slackThreadTs,
    slackTeamId: input.slackTeamId,
    slackUserId: input.slackUserId,
    slackMessageTs: input.slackMessageTs,
    threadContext: input.threadContext,
    prompt: input.prompt,
    followUpAgentId: input.followUpAgentId,
    telegramInboundMessageId: input.telegramInboundMessageId,
    telegramAckMessageId: input.telegramAckMessageId,
    files: input.files,
    status: "queued",
    events: [
      {
        at: now,
        type: "created",
        detail: input.files?.length
          ? `Received from ${input.source} with ${input.files.length} file(s)`
          : `Received from ${input.source}`,
      },
    ],
  };
}

export async function createJob(input: {
  source: JobSource;
  prompt: string;
  chatId?: number;
  username?: string;
  displayName?: string;
  slackChannelId?: string;
  slackThreadTs?: string;
  slackTeamId?: string;
  slackUserId?: string;
  slackMessageTs?: string;
  threadContext?: string;
  files?: Job["files"];
  followUpAgentId?: string;
  telegramInboundMessageId?: number;
  telegramAckMessageId?: number;
}): Promise<Job> {
  await ensureJobMigration();
  const job = buildJob(input);
  const now = job.createdAt;

  if (jobsBackendIsRedis()) {
    await writeJobRecord(job);
    await updateStore((data) => {
      if (input.chatId) {
        upsertChat(data.chats, {
          chatId: input.chatId,
          username: input.username,
          displayName: input.displayName,
          at: now,
        });
      }
      if (input.slackChannelId && input.slackThreadTs) {
        rememberSlackThreadInStore(data, {
          channelId: input.slackChannelId,
          threadTs: input.slackThreadTs,
          lastJobId: job.id,
          updatedAt: now,
        });
      }
    });
    return job;
  }

  return updateStore((data) => {
    data.jobs.unshift(job);
    data.jobs = data.jobs.slice(0, MAX_JOBS_FILE);
    if (input.chatId) {
      upsertChat(data.chats, {
        chatId: input.chatId,
        username: input.username,
        displayName: input.displayName,
        at: now,
      });
    }
    if (input.slackChannelId && input.slackThreadTs) {
      rememberSlackThreadInStore(data, {
        channelId: input.slackChannelId,
        threadTs: input.slackThreadTs,
        lastJobId: job.id,
        updatedAt: now,
      });
    }
    return job;
  });
}

export async function addJobEvent(
  jobId: string,
  event: Omit<JobEvent, "at"> & { at?: string },
  patch?: Partial<Job>,
): Promise<Job | undefined> {
  await ensureJobMigration();

  if (jobsBackendIsRedis()) {
    const job = await readJobRecord(jobId);
    if (!job) return undefined;
    job.updatedAt = new Date().toISOString();
    pushJobEvent(job, event, job.updatedAt);
    if (patch) {
      Object.assign(job, patch, { updatedAt: job.updatedAt });
      if ("pendingArtifacts" in patch && patch.pendingArtifacts === undefined) {
        delete job.pendingArtifacts;
      }
    }
    const saved = await writeJobRecord(capJobEvents(job));
    if (saved.slackChannelId && saved.slackThreadTs) {
      await rememberSlackThread({
        channelId: saved.slackChannelId,
        threadTs: saved.slackThreadTs,
        lastJobId: saved.id,
      });
    }
    return saved;
  }

  return updateStore((data) => {
    const job = data.jobs.find((item) => item?.id === jobId);
    if (!job) return undefined;
    job.updatedAt = new Date().toISOString();
    pushJobEvent(job, event, job.updatedAt);
    if (patch) {
      Object.assign(job, patch, { updatedAt: job.updatedAt });
      if ("pendingArtifacts" in patch && patch.pendingArtifacts === undefined) {
        delete job.pendingArtifacts;
      }
    }
    return capJobEvents(job);
  });
}

/**
 * Insert or replace a job by id. Used after Cursor starts so a concurrent
 * store overwrite cannot leave an agent with no Relay job to settle.
 */
export async function upsertJob(job: Job): Promise<Job> {
  await ensureJobMigration();
  const now = new Date().toISOString();
  const next: Job = { ...job, updatedAt: now };

  if (jobsBackendIsRedis()) {
    const saved = await writeJobRecord(next);
    if (saved.slackChannelId && saved.slackThreadTs) {
      await rememberSlackThread({
        channelId: saved.slackChannelId,
        threadTs: saved.slackThreadTs,
        lastJobId: saved.id,
      });
    }
    return saved;
  }

  return updateStore((data) => {
    const index = data.jobs.findIndex((item) => item?.id === job.id);
    if (index >= 0) {
      data.jobs[index] = { ...data.jobs[index], ...next };
      const [existing] = data.jobs.splice(index, 1);
      data.jobs.unshift(existing);
    } else {
      data.jobs.unshift(next);
    }
    data.jobs = data.jobs.filter(Boolean).slice(0, MAX_JOBS_FILE);
    if (next.slackChannelId && next.slackThreadTs) {
      rememberSlackThreadInStore(data, {
        channelId: next.slackChannelId,
        threadTs: next.slackThreadTs,
        lastJobId: next.id,
        updatedAt: now,
      });
    }
    return data.jobs[0]!;
  });
}

/** Atomically claim a dispatched job so two webhook/poll workers cannot both deliver. */
export async function claimJobForSettle(jobId: string): Promise<Job | undefined> {
  await ensureJobMigration();

  if (jobsBackendIsRedis()) {
    if (!(await claimSettleSlot(jobId))) return undefined;
    const job = await readJobRecord(jobId);
    if (!job || job.status !== "dispatched") {
      await releaseSettleSlot(jobId);
      return undefined;
    }
    job.status = "delivering";
    job.updatedAt = new Date().toISOString();
    pushJobEvent(job, {
      type: "delivering",
      detail: "Collecting Cursor answer and artifacts",
    }, job.updatedAt);
    return writeJobRecord(job);
  }

  return updateStore((data) => {
    const job = data.jobs.find((item) => item?.id === jobId);
    if (!job || job.status !== "dispatched") return undefined;
    job.status = "delivering";
    job.updatedAt = new Date().toISOString();
    pushJobEvent(job, {
      type: "delivering",
      detail: "Collecting Cursor answer and artifacts",
    }, job.updatedAt);
    return job;
  });
}

export async function reclaimStaleDeliveringJobs(maxAgeMs = 120_000) {
  await ensureJobMigration();
  const now = Date.now();

  if (jobsBackendIsRedis()) {
    const jobs = await listRecentJobRecords(ACTIVE_JOB_SCAN_LIMIT);
    let reclaimed = 0;
    for (const job of jobs) {
      if (job.status !== "delivering") continue;
      if (now - Date.parse(job.updatedAt) < maxAgeMs) continue;
      job.status = "dispatched";
      job.updatedAt = new Date().toISOString();
      pushJobEvent(job, {
        type: "reclaimed",
        detail: "Delivery worker timed out; polling will retry",
      }, job.updatedAt);
      await writeJobRecord(job);
      await releaseSettleSlot(job.id);
      reclaimed += 1;
    }
    return reclaimed;
  }

  return updateStore((data) => {
    let reclaimed = 0;
    for (const job of data.jobs) {
      if (job.status !== "delivering") continue;
      if (now - Date.parse(job.updatedAt) < maxAgeMs) continue;
      job.status = "dispatched";
      job.updatedAt = new Date().toISOString();
      pushJobEvent(job, {
        type: "reclaimed",
        detail: "Delivery worker timed out; polling will retry",
      }, job.updatedAt);
      reclaimed += 1;
    }
    return reclaimed;
  });
}

export async function getJob(jobId: string): Promise<Job | undefined> {
  await ensureJobMigration();
  if (jobsBackendIsRedis()) {
    return readJobRecord(jobId);
  }
  const data = await getStore();
  return data.jobs.find((job) => job.id === jobId);
}

export async function listJobs(limit = DASHBOARD_JOB_LIMIT): Promise<Job[]> {
  await ensureJobMigration();
  if (jobsBackendIsRedis()) {
    return listRecentJobRecords(limit);
  }
  const data = await getStore();
  return data.jobs.slice(0, limit);
}

/** Resolve a job for a Cursor agent via the agent index (Redis) or scan. */
export async function findDispatchedJobForAgentId(
  agentId: string,
): Promise<Job | undefined> {
  await ensureJobMigration();
  const { findDispatchedJobForAgent } = await import("@/lib/cursor-settle");
  if (jobsBackendIsRedis()) {
    const jobId = await getJobIdForAgent(agentId);
    if (jobId) {
      const job = await readJobRecord(jobId);
      if (job?.status === "dispatched") return job;
    }
  }
  const jobs = await listJobs(ACTIVE_JOB_SCAN_LIMIT);
  return findDispatchedJobForAgent(jobs, agentId);
}

export function findSlackThreadJob(
  jobs: Job[],
  channelId: string,
  threadTs: string,
): Job | undefined {
  return jobs.find(
    (job) =>
      job.source === "slack" &&
      job.slackChannelId === channelId &&
      job.slackThreadTs === threadTs &&
      Boolean(job.cursorAgentId ?? job.followUpAgentId),
  );
}

export function findJobForSlackInbound(
  jobs: Job[],
  channelId: string,
  messageTs: string,
) {
  return jobs.find(
    (job) =>
      job.source === "slack" &&
      job.slackChannelId === channelId &&
      job.slackMessageTs === messageTs &&
      job.status !== "error",
  );
}

export function findTelegramFollowUpJob(
  jobs: Job[],
  chatId: number,
  replyToMessageId: number,
): Job | undefined {
  return jobs.find((job) => {
    if (job.chatId !== chatId) return false;
    return (
      job.reply?.telegramMessageId === replyToMessageId ||
      job.telegramAckMessageId === replyToMessageId ||
      job.telegramInboundMessageId === replyToMessageId
    );
  });
}

export async function rememberChat(chat: {
  chatId: number;
  username?: string;
  displayName?: string;
}) {
  const now = new Date().toISOString();
  await updateStore((data) => {
    upsertChat(data.chats, { ...chat, at: now });
  });
}

export async function logInbound(entry: Omit<InboundMessage, "at">) {
  const now = new Date().toISOString();
  await updateStore((data) => {
    data.inbound = data.inbound ?? [];
    data.inbound.unshift({ ...entry, at: now });
    data.inbound = data.inbound.slice(0, 50);
  });
}

export async function latestChat(): Promise<TelegramChat | undefined> {
  const data = await getStore();
  return data.chats[0];
}

export async function listChats(): Promise<TelegramChat[]> {
  const data = await getStore();
  return data.chats;
}

export async function rememberSlackThreadsFromJobs() {
  const now = new Date().toISOString();
  const jobs = await listJobs(ACTIVE_JOB_SCAN_LIMIT);
  await updateStore((data) => {
    for (const job of [...jobs].reverse()) {
      if (!job.slackChannelId || !job.slackThreadTs) continue;
      rememberSlackThreadInStore(data, {
        channelId: job.slackChannelId,
        threadTs: job.slackThreadTs,
        lastJobId: job.id,
        updatedAt: now,
      });
    }
  });
}

export async function rememberSlackThread(input: {
  channelId: string;
  threadTs: string;
  lastJobId?: string;
}) {
  const now = new Date().toISOString();
  await updateStore((data) => {
    rememberSlackThreadInStore(data, { ...input, updatedAt: now });
  });
}

export async function getSlackThread(
  channelId: string,
  threadTs: string,
): Promise<SlackThreadRef | undefined> {
  const data = await getStore();
  return data.slackThreads?.[slackThreadKey(channelId, threadTs)];
}

export async function markSlackEventProcessed(eventId: string): Promise<boolean> {
  if (kvEnabled()) {
    const { getRedis } = await import("@/lib/store");
    const redis = await getRedis();
    const ok = await redis.set(`relay:slack-event:${eventId}`, "1", {
      nx: true,
      ex: 60 * 60 * 24 * 7,
    });
    if (ok !== "OK") return false;
  }
  return updateStore((data) => {
    data.processedSlackEvents = data.processedSlackEvents ?? [];
    if (data.processedSlackEvents.includes(eventId)) return false;
    data.processedSlackEvents.unshift(eventId);
    data.processedSlackEvents = data.processedSlackEvents.slice(
      0,
      MAX_SLACK_EVENT_IDS,
    );
    return true;
  });
}

export async function listSlackThreads(): Promise<SlackThreadRef[]> {
  const data = await getStore();
  return Object.values(data.slackThreads ?? {});
}

export async function getSlackSearchCursor() {
  const data = await getStore();
  return data.slackSearchCursor;
}

export async function setSlackSearchCursor(ts: string) {
  await updateStore((data) => {
    data.slackSearchCursor = ts;
  });
}

export async function markSlackMessageProcessed(messageKey: string): Promise<boolean> {
  return claimSlackInboundMessage(messageKey);
}

export async function getSlackPollCursor(channelId: string) {
  const data = await getStore();
  return data.slackPollCursors?.[channelId];
}

export async function setSlackPollCursor(channelId: string, ts: string) {
  await updateStore((data) => {
    data.slackPollCursors = data.slackPollCursors ?? {};
    data.slackPollCursors[channelId] = ts;
  });
}

function rememberSlackThreadInStore(
  data: {
    slackThreads?: Record<string, SlackThreadRef>;
  },
  input: SlackThreadRef,
) {
  data.slackThreads = data.slackThreads ?? {};
  const key = slackThreadKey(input.channelId, input.threadTs);
  const existing = data.slackThreads[key];
  data.slackThreads[key] = {
    ...existing,
    ...input,
    lastJobId: input.lastJobId ?? existing?.lastJobId,
  };
}

function upsertChat(
  chats: TelegramChat[],
  input: {
    chatId: number;
    username?: string;
    displayName?: string;
    at: string;
  },
) {
  const existing = chats.find((chat) => chat.chatId === input.chatId);
  if (existing) {
    existing.lastMessageAt = input.at;
    existing.username = input.username ?? existing.username;
    existing.displayName = input.displayName ?? existing.displayName;
    chats.splice(chats.indexOf(existing), 1);
    chats.unshift(existing);
    return;
  }
  chats.unshift({
    chatId: input.chatId,
    username: input.username,
    displayName: input.displayName,
    firstSeenAt: input.at,
    lastMessageAt: input.at,
  });
}
