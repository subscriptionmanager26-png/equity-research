import { noteRedisError } from "@/lib/redis-failover";
import { getRedis, kvEnabled } from "@/lib/store";
import type { Job, JobStatus } from "@/lib/types";
import { normalizeCursorAgentId } from "@/lib/cursor-api";

async function withRedisOrFail<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    noteRedisError(error);
    throw error;
  }
}

export const JOB_KEY_PREFIX = "relay:job:";
export const AGENT_KEY_PREFIX = "relay:agent:";
export const RECENT_JOBS_KEY = "relay:jobs:recent";
export const JOBS_MIGRATED_KEY = "relay:jobs:migrated-v1";
/** Cap of the recent ZSET (dashboard + catch-up scans). */
export const MAX_RECENT_JOBS = 200;
/** Default jobs returned to the dashboard — keep this small to save Redis GETs. */
export const DASHBOARD_JOB_LIMIT = 40;
/** Poller / settle scan window. */
export const ACTIVE_JOB_SCAN_LIMIT = 80;
export const MAX_JOB_EVENTS = 20;
/** Terminal job + agent index retention. */
export const JOB_TTL_SECONDS = 60 * 60 * 24 * 14;
const SETTLE_CLAIM_PREFIX = "relay:settle:";

export function jobKey(jobId: string) {
  return `${JOB_KEY_PREFIX}${jobId}`;
}

export function agentKey(agentId: string) {
  return `${AGENT_KEY_PREFIX}${normalizeCursorAgentId(agentId)}`;
}

export function jobsBackendIsRedis() {
  return kvEnabled();
}

export function isTerminalJobStatus(status: JobStatus) {
  return status === "replied" || status === "error";
}

export function capJobEvents<T extends { events?: Job["events"] }>(job: T): T {
  const events = job.events ?? [];
  if (events.length <= MAX_JOB_EVENTS) return job;
  return { ...job, events: events.slice(0, MAX_JOB_EVENTS) };
}

let migratedCache: boolean | undefined;
let migratedCheckAt = 0;
const MIGRATED_RECHECK_MS = 60_000;

/** True once the one-time blob→per-key migration has completed (cached). */
export async function isJobsMigrated(): Promise<boolean> {
  if (!kvEnabled()) return true;
  if (migratedCache === true) return true;
  if (migratedCache === false && Date.now() - migratedCheckAt < MIGRATED_RECHECK_MS) {
    return false;
  }
  try {
    const redis = await getRedis();
    const flag = await redis.exists(JOBS_MIGRATED_KEY);
    migratedCache = Boolean(flag);
    migratedCheckAt = Date.now();
    return migratedCache;
  } catch (error) {
    noteRedisError(error);
    // Assume migrated so we stop burning Redis EXISTS every request.
    migratedCache = true;
    migratedCheckAt = Date.now();
    return true;
  }
}

export function markJobsMigratedCached() {
  migratedCache = true;
  migratedCheckAt = Date.now();
}

export async function readJobRecord(jobId: string): Promise<Job | undefined> {
  return withRedisOrFail(async () => {
    const redis = await getRedis();
    const job = await redis.get<Job>(jobKey(jobId));
    return job ?? undefined;
  });
}

export async function writeJobRecord(job: Job): Promise<Job> {
  return withRedisOrFail(async () => {
    const redis = await getRedis();
    const now = Date.now();
    const next = capJobEvents({
      ...job,
      updatedAt: new Date(now).toISOString(),
    });
    const terminal = isTerminalJobStatus(next.status);
    const pipe = redis.pipeline();
    if (terminal) {
      pipe.set(jobKey(next.id), next, { ex: JOB_TTL_SECONDS });
    } else {
      pipe.set(jobKey(next.id), next);
    }
    pipe.zadd(RECENT_JOBS_KEY, { score: now, member: next.id });
    // Keep only the newest MAX_RECENT_JOBS members (1 command; no per-key fan-out).
    pipe.zremrangebyrank(RECENT_JOBS_KEY, 0, -(MAX_RECENT_JOBS + 1));
    if (next.cursorAgentId) {
      if (terminal) {
        pipe.set(agentKey(next.cursorAgentId), next.id, { ex: JOB_TTL_SECONDS });
      } else {
        pipe.set(agentKey(next.cursorAgentId), next.id);
      }
    }
    await pipe.exec();
    return next;
  });
}

/** Cheap job count for /api/status — one ZCARD, no GETs. */
export async function countRecentJobs(): Promise<number> {
  if (!kvEnabled()) return 0;
  return withRedisOrFail(async () => {
    const redis = await getRedis();
    return redis.zcard(RECENT_JOBS_KEY);
  });
}

/**
 * List recent jobs with a single ZRANGE + one MGET (not N sequential GETs).
 */
export async function listRecentJobRecords(
  limit = DASHBOARD_JOB_LIMIT,
): Promise<Job[]> {
  return withRedisOrFail(async () => {
    const redis = await getRedis();
    const take = Math.max(1, Math.min(limit, MAX_RECENT_JOBS));
    const ids = await redis.zrange(RECENT_JOBS_KEY, 0, take - 1, { rev: true });
    if (!ids.length) return [];
    const keys = ids.map((id) => jobKey(String(id)));
    const rows = await redis.mget<(Job | null)[]>(...keys);
    const jobs: Job[] = [];
    for (const row of rows ?? []) {
      if (row && typeof row === "object" && "id" in row) jobs.push(row as Job);
    }
    return jobs;
  });
}

/** Light prune used by cron only — samples oldest ids, not the full ZSET. */
export async function pruneMissingRecentJobs(sample = 25): Promise<number> {
  if (!kvEnabled()) return 0;
  const redis = await getRedis();
  const ids = await redis.zrange(RECENT_JOBS_KEY, 0, Math.max(0, sample - 1));
  if (!ids.length) return 0;
  const keys = ids.map((id) => jobKey(String(id)));
  const rows = await redis.mget<(Job | null)[]>(...keys);
  let pruned = 0;
  const stale: string[] = [];
  ids.forEach((id, i) => {
    if (!rows?.[i]) {
      stale.push(String(id));
      pruned += 1;
    }
  });
  if (stale.length) await redis.zrem(RECENT_JOBS_KEY, ...stale);
  return pruned;
}

export async function getJobIdForAgent(agentId: string): Promise<string | undefined> {
  const redis = await getRedis();
  const jobId = await redis.get<string>(agentKey(agentId));
  return jobId ?? undefined;
}

export async function indexAgentJob(agentId: string, jobId: string) {
  const redis = await getRedis();
  await redis.set(agentKey(agentId), jobId);
}

/** Claim settle exclusively for ~2 minutes so webhook + poll cannot double-deliver. */
export async function claimSettleSlot(jobId: string, ttlSeconds = 120): Promise<boolean> {
  const redis = await getRedis();
  const ok = await redis.set(`${SETTLE_CLAIM_PREFIX}${jobId}`, "1", {
    nx: true,
    ex: ttlSeconds,
  });
  return ok === "OK";
}

export async function releaseSettleSlot(jobId: string) {
  const redis = await getRedis();
  await redis.del(`${SETTLE_CLAIM_PREFIX}${jobId}`);
}

/**
 * One-time migration: copy jobs[] from the legacy blob into per-job keys.
 * Safe to call repeatedly; uses an NX flag.
 */
export async function migrateJobsFromBlobIfNeeded(
  blobJobs: Job[] | undefined,
): Promise<number> {
  if (!kvEnabled() || !blobJobs?.length) {
    if (kvEnabled()) markJobsMigratedCached();
    return 0;
  }
  const redis = await getRedis();
  const flagged = await redis.set(JOBS_MIGRATED_KEY, "1", { nx: true });
  if (flagged !== "OK") {
    markJobsMigratedCached();
    return 0;
  }

  let migrated = 0;
  let pipe = redis.pipeline();
  let batch = 0;
  const flush = async () => {
    if (batch === 0) return;
    await pipe.exec();
    pipe = redis.pipeline();
    batch = 0;
  };
  for (const job of blobJobs) {
    if (!job?.id) continue;
    const capped = capJobEvents(job);
    if (isTerminalJobStatus(capped.status)) {
      pipe.set(jobKey(capped.id), capped, { ex: JOB_TTL_SECONDS });
    } else {
      pipe.set(jobKey(capped.id), capped);
    }
    const score = Date.parse(capped.updatedAt || capped.createdAt) || Date.now();
    pipe.zadd(RECENT_JOBS_KEY, { score, member: capped.id });
    if (capped.cursorAgentId) {
      if (isTerminalJobStatus(capped.status)) {
        pipe.set(agentKey(capped.cursorAgentId), capped.id, { ex: JOB_TTL_SECONDS });
      } else {
        pipe.set(agentKey(capped.cursorAgentId), capped.id);
      }
    }
    migrated += 1;
    batch += 1;
    if (batch >= 50) await flush();
  }
  pipe.zremrangebyrank(RECENT_JOBS_KEY, 0, -(MAX_RECENT_JOBS + 1));
  batch += 1;
  await flush();
  markJobsMigratedCached();
  console.info(`[relay] Migrated ${migrated} jobs from blob to per-job keys`);
  return migrated;
}
