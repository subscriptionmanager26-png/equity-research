import { getRedis, kvEnabled } from "@/lib/store";
import type { Job } from "@/lib/types";
import { normalizeCursorAgentId } from "@/lib/cursor-api";

export const JOB_KEY_PREFIX = "relay:job:";
export const AGENT_KEY_PREFIX = "relay:agent:";
export const RECENT_JOBS_KEY = "relay:jobs:recent";
export const JOBS_MIGRATED_KEY = "relay:jobs:migrated-v1";
export const MAX_RECENT_JOBS = 500;
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

export async function readJobRecord(jobId: string): Promise<Job | undefined> {
  const redis = await getRedis();
  const job = await redis.get<Job>(jobKey(jobId));
  return job ?? undefined;
}

export async function writeJobRecord(job: Job): Promise<Job> {
  const redis = await getRedis();
  const now = Date.now();
  const next: Job = { ...job, updatedAt: new Date(now).toISOString() };
  await redis.set(jobKey(next.id), next);
  await redis.zadd(RECENT_JOBS_KEY, { score: now, member: next.id });
  await trimRecentJobs(redis);
  if (next.cursorAgentId) {
    await redis.set(agentKey(next.cursorAgentId), next.id);
  }
  return next;
}

async function trimRecentJobs(redis: Awaited<ReturnType<typeof getRedis>>) {
  const count = await redis.zcard(RECENT_JOBS_KEY);
  if (count <= MAX_RECENT_JOBS) return;
  const stale = await redis.zrange(RECENT_JOBS_KEY, 0, count - MAX_RECENT_JOBS - 1);
  if (!stale.length) return;
  await redis.zrem(RECENT_JOBS_KEY, ...stale);
  // Keep job payloads for active statuses; drop only from the recent index.
}

export async function listRecentJobRecords(limit = MAX_RECENT_JOBS): Promise<Job[]> {
  const redis = await getRedis();
  const ids = await redis.zrange(RECENT_JOBS_KEY, 0, Math.max(0, limit - 1), {
    rev: true,
  });
  if (!ids.length) return [];
  const jobs: Job[] = [];
  for (const id of ids) {
    const row = await redis.get<Job>(jobKey(String(id)));
    if (row && typeof row === "object" && "id" in row) jobs.push(row);
  }
  return jobs;
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
  if (!kvEnabled() || !blobJobs?.length) return 0;
  const redis = await getRedis();
  const flagged = await redis.set(JOBS_MIGRATED_KEY, "1", { nx: true });
  if (flagged !== "OK") return 0;

  let migrated = 0;
  for (const job of blobJobs) {
    if (!job?.id) continue;
    const existing = await redis.get(jobKey(job.id));
    if (!existing) {
      await redis.set(jobKey(job.id), job);
      const score = Date.parse(job.updatedAt || job.createdAt) || Date.now();
      await redis.zadd(RECENT_JOBS_KEY, { score, member: job.id });
      if (job.cursorAgentId) {
        await redis.set(agentKey(job.cursorAgentId), job.id);
      }
      migrated += 1;
    }
  }
  await trimRecentJobs(redis);
  console.info(`[relay] Migrated ${migrated} jobs from blob to per-job keys`);
  return migrated;
}
