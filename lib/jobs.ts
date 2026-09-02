import { getStore, updateStore } from "@/lib/store";
import type {
  InboundMessage,
  Job,
  JobEvent,
  JobSource,
  SlackThreadRef,
  TelegramChat,
} from "@/lib/types";

const MAX_JOBS = 100;
const MAX_SLACK_EVENT_IDS = 500;

export function newJobId() {
  return `job_${crypto.randomUUID()}`;
}

export function slackThreadKey(channelId: string, threadTs: string) {
  return `${channelId}:${threadTs}`;
}

export async function createJob(input: {
  source: JobSource;
  prompt: string;
  chatId?: number;
  username?: string;
  displayName?: string;
  slackChannelId?: string;
  slackThreadTs?: string;
  slackUserId?: string;
  slackMessageTs?: string;
  threadContext?: string;
  files?: Job["files"];
  followUpAgentId?: string;
  telegramInboundMessageId?: number;
  telegramAckMessageId?: number;
}): Promise<Job> {
  const now = new Date().toISOString();
  const job: Job = {
    id: newJobId(),
    createdAt: now,
    updatedAt: now,
    source: input.source,
    chatId: input.chatId,
    username: input.username,
    displayName: input.displayName,
    slackChannelId: input.slackChannelId,
    slackThreadTs: input.slackThreadTs,
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

  return updateStore((data) => {
    data.jobs.unshift(job);
    data.jobs = data.jobs.slice(0, MAX_JOBS);
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
  return updateStore((data) => {
    const job = data.jobs.find((item) => item.id === jobId);
    if (!job) return undefined;
    job.updatedAt = new Date().toISOString();
    job.events.unshift({
      at: event.at ?? job.updatedAt,
      type: event.type,
      detail: event.detail,
    });
    if (patch) {
      Object.assign(job, patch, { updatedAt: job.updatedAt });
      if ("pendingArtifacts" in patch && patch.pendingArtifacts === undefined) {
        delete job.pendingArtifacts;
      }
    }
    return job;
  });
}

/** Atomically claim a dispatched job so two webhook/poll workers cannot both deliver. */
export async function claimJobForSettle(jobId: string): Promise<Job | undefined> {
  return updateStore((data) => {
    const job = data.jobs.find((item) => item.id === jobId);
    if (!job || job.status !== "dispatched") return undefined;
    job.status = "delivering";
    job.updatedAt = new Date().toISOString();
    job.events.unshift({
      at: job.updatedAt,
      type: "delivering",
      detail: "Collecting Cursor answer and artifacts",
    });
    return job;
  });
}

export async function reclaimStaleDeliveringJobs(maxAgeMs = 120_000) {
  const now = Date.now();
  return updateStore((data) => {
    let reclaimed = 0;
    for (const job of data.jobs) {
      if (job.status !== "delivering") continue;
      if (now - Date.parse(job.updatedAt) < maxAgeMs) continue;
      job.status = "dispatched";
      job.updatedAt = new Date().toISOString();
      job.events.unshift({
        at: job.updatedAt,
        type: "reclaimed",
        detail: "Delivery worker timed out; polling will retry",
      });
      reclaimed += 1;
    }
    return reclaimed;
  });
}

export async function getJob(jobId: string): Promise<Job | undefined> {
  const data = await getStore();
  return data.jobs.find((job) => job.id === jobId);
}

export async function listJobs(): Promise<Job[]> {
  const data = await getStore();
  return data.jobs;
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
  await updateStore((data) => {
    for (const job of [...data.jobs].reverse()) {
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
  return updateStore((data) => {
    data.processedSlackMessages = data.processedSlackMessages ?? [];
    if (data.processedSlackMessages.includes(messageKey)) return false;
    data.processedSlackMessages.unshift(messageKey);
    data.processedSlackMessages = data.processedSlackMessages.slice(0, 2000);
    return true;
  });
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
