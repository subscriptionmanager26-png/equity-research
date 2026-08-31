import { getStore, updateStore } from "@/lib/store";
import type { InboundMessage, Job, JobEvent, JobSource, TelegramChat } from "@/lib/types";

const MAX_JOBS = 100;

export function newJobId() {
  return `job_${crypto.randomUUID()}`;
}

export async function createJob(input: {
  source: JobSource;
  prompt: string;
  chatId?: number;
  username?: string;
  displayName?: string;
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
    prompt: input.prompt,
    status: "queued",
    events: [
      {
        at: now,
        type: "created",
        detail: `Received from ${input.source}`,
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
    if (patch) Object.assign(job, patch, { updatedAt: job.updatedAt });
    return job;
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
