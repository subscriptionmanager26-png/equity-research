import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StoreData } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const KV_KEY = "relay:store";

const emptyStore = (): StoreData => ({
  jobs: [],
  chats: [],
  slackThreads: {},
  processedSlackEvents: [],
  slackPollCursors: {},
  processedSlackMessages: [],
});

let queue: Promise<unknown> = Promise.resolve();

function kvEnabled() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
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
    telegramOffset: parsed.telegramOffset,
  };
}

async function readStoreFromKv(): Promise<StoreData> {
  const { kv } = await import("@vercel/kv");
  const parsed = await kv.get<StoreData>(KV_KEY);
  return parsed ? normalizeStore(parsed) : emptyStore();
}

async function writeStoreToKv(data: StoreData): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(KV_KEY, data);
}

async function readStore(): Promise<StoreData> {
  if (kvEnabled()) return readStoreFromKv();
  return readStoreFromFile();
}

async function writeStore(data: StoreData): Promise<void> {
  if (kvEnabled()) return writeStoreToKv(data);
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
  return kvEnabled() ? "vercel-kv" : "local-file";
}
