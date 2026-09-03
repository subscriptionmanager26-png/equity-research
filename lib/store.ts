import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StoreData } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const KV_KEY = "relay:store";
const BLOB_PATH = "relay/store.json";

const emptyStore = (): StoreData => ({
  jobs: [],
  chats: [],
  slackThreads: {},
  processedSlackEvents: [],
  slackPollCursors: {},
  processedSlackMessages: [],
});

let queue: Promise<unknown> = Promise.resolve();

function blobEnabled() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
  );
}

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (!value?.trim()) continue;
    if (names.some((name) => key === name || key.endsWith(`_${name}`))) {
      return value.trim();
    }
  }
  return "";
}

function redisCredentials() {
  const url = firstEnv([
    "UPSTASH_REDIS_REST_URL",
    "KV_REST_API_URL",
  ]);
  const token = firstEnv([
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_TOKEN",
  ]);
  if (!url || !token) return undefined;
  return { url, token };
}

function kvEnabled() {
  return Boolean(redisCredentials());
}

let redisClient: import("@upstash/redis").Redis | undefined;

async function getRedis() {
  const creds = redisCredentials();
  if (!creds) throw new Error("Upstash Redis is not configured");
  if (!redisClient) {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis(creds);
  }
  return redisClient;
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStoreFromFile(): Promise<StoreData> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    return normalizeStore(parsed);
  } catch {
    return emptyStore();
  }
}

async function writeStoreToFile(data: StoreData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function normalizeStore(parsed: StoreData): StoreData {
  return {
    jobs: parsed.jobs ?? [],
    chats: parsed.chats ?? [],
    slackThreads: parsed.slackThreads ?? {},
    processedSlackEvents: parsed.processedSlackEvents ?? [],
    inbound: parsed.inbound ?? [],
    bot: parsed.bot,
    slackBot: parsed.slackBot,
    slackSearchCursor: parsed.slackSearchCursor,
    slackPollCursors: parsed.slackPollCursors ?? {},
    processedSlackMessages: parsed.processedSlackMessages ?? [],
    slackLastPollAt: parsed.slackLastPollAt,
    slackPollNextScheduledAt: parsed.slackPollNextScheduledAt,
    telegramOffset: parsed.telegramOffset,
  };
}

const SLACK_POLL_CHAIN_KEY = "relay:slack-poll-chain";
const SLACK_MSG_PREFIX = "relay:slack-msg:";

/** Cross-instance dedupe for a Slack channel:ts before dispatching a job. */
export async function claimSlackInboundMessage(messageKey: string): Promise<boolean> {
  const ttlSeconds = 60 * 60 * 24 * 14;
  if (kvEnabled()) {
    const redis = await getRedis();
    const ok = await redis.set(`${SLACK_MSG_PREFIX}${messageKey}`, "1", {
      nx: true,
      ex: ttlSeconds,
    });
    if (ok !== "OK") return false;
    await updateStore((data) => {
      data.processedSlackMessages = data.processedSlackMessages ?? [];
      if (!data.processedSlackMessages.includes(messageKey)) {
        data.processedSlackMessages.unshift(messageKey);
        data.processedSlackMessages = data.processedSlackMessages.slice(0, 2000);
      }
    });
    return true;
  }
  return updateStore((data) => {
    data.processedSlackMessages = data.processedSlackMessages ?? [];
    if (data.processedSlackMessages.includes(messageKey)) return false;
    data.processedSlackMessages.unshift(messageKey);
    data.processedSlackMessages = data.processedSlackMessages.slice(0, 2000);
    return true;
  });
}

/** One-at-a-time slot so Vercel minute scans cannot fork into parallel loops. */
export async function acquireSlackPollChainSlot(ttlSeconds = 52): Promise<boolean> {
  if (kvEnabled()) {
    const redis = await getRedis();
    const ok = await redis.set(SLACK_POLL_CHAIN_KEY, "1", {
      nx: true,
      ex: ttlSeconds,
    });
    return ok === "OK";
  }
  return updateStore((data) => {
    const until = Date.parse(data.slackPollNextScheduledAt ?? "") || 0;
    if (until > Date.now()) return false;
    data.slackPollNextScheduledAt = new Date(
      Date.now() + ttlSeconds * 1000,
    ).toISOString();
    return true;
  });
}

export async function releaseSlackPollChainSlot() {
  if (kvEnabled()) {
    const redis = await getRedis();
    await redis.del(SLACK_POLL_CHAIN_KEY);
    return;
  }
  await updateStore((data) => {
    data.slackPollNextScheduledAt = new Date(0).toISOString();
  });
}

let lastGoodStore: StoreData | undefined;
let blobReadFailed = false;

async function readStoreFromBlob(): Promise<StoreData> {
  const { get } = await import("@vercel/blob");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await get(BLOB_PATH, {
        access: "private",
        useCache: false,
      });
      if (!result || result.statusCode !== 200 || !result.stream) {
        blobReadFailed = false;
        return lastGoodStore ?? emptyStore();
      }
      const raw = await new Response(result.stream).text();
      if (!raw.trim()) {
        blobReadFailed = false;
        return lastGoodStore ?? emptyStore();
      }
      const store = normalizeStore(JSON.parse(raw) as StoreData);
      lastGoodStore = store;
      blobReadFailed = false;
      return store;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  blobReadFailed = true;
  if (lastGoodStore) {
    console.error("[relay] Blob read failed; using last good store", lastError);
    return lastGoodStore;
  }
  throw lastError;
}

async function writeStoreToBlob(data: StoreData): Promise<void> {
  if (blobReadFailed) {
    console.error("[relay] Skipping blob write after a failed read");
    return;
  }
  const { put } = await import("@vercel/blob");
  await put(BLOB_PATH, JSON.stringify(data), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
  lastGoodStore = data;
}

async function readStoreFromKv(): Promise<StoreData> {
  const redis = await getRedis();
  const parsed = await redis.get<StoreData>(KV_KEY);
  return parsed ? normalizeStore(parsed) : emptyStore();
}

async function writeStoreToKv(data: StoreData): Promise<void> {
  const redis = await getRedis();
  await redis.set(KV_KEY, data);
}

function activeBackend(): "upstash-redis" | "vercel-blob" | "local-file" {
  const forced = (process.env.RELAY_STORE ?? "").trim().toLowerCase();
  if (forced === "blob" && blobEnabled()) return "vercel-blob";
  if (forced === "file") return "local-file";
  if (kvEnabled()) return "upstash-redis";
  if (blobEnabled()) return "vercel-blob";
  return "local-file";
}

async function readStore(): Promise<StoreData> {
  const backend = activeBackend();
  if (backend === "upstash-redis") return readStoreFromKv();
  if (backend === "vercel-blob") return readStoreFromBlob();
  return readStoreFromFile();
}

async function writeStore(data: StoreData): Promise<void> {
  const backend = activeBackend();
  if (backend === "upstash-redis") return writeStoreToKv(data);
  if (backend === "vercel-blob") return writeStoreToBlob(data);
  return writeStoreToFile(data);
}

export function updateStore<T>(
  mutator: (data: StoreData) => T | Promise<T>,
): Promise<T> {
  return withLock(async () => {
    const data = await readStore();
    const result = await mutator(data);
    await writeStore(data);
    return result;
  });
}

export function getStore(): Promise<StoreData> {
  return withLock(() => readStore());
}

export function storeBackend() {
  return activeBackend();
}
