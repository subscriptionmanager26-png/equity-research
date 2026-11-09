import { getRedis, kvEnabled } from "@/lib/store";
import type { Job, JobStatus } from "@/lib/types";
import { normalizeCursorAgentId } from "@/lib/cursor-api";

export const JOB_KEY_PREFIX = "relay:job:";
export const AGENT_KEY_PREFIX = "relay:agent:";
export const RECENT_JOBS_KEY = "relay:jobs:recent";
export const JOBS_MIGRATED_KEY = "relay:jobs:migrated-v1";
export const MAX_RECENT_JOBS = 500;
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

export async function readJobRecord(jobId: string): Promise<Job | undefined> {
  const redis = await getRedis();
  const job = await redis.get<Job>(jobKey(jobId));
  return job ?? undefined;
}

export async function writeJobRecord(job: Job): Promise<Job> {
  const redis = await getRedis();
  const now = Date.now();
  const next = capJobEvents({
    ...job,
    updatedAt: new Date(now).toISOString(),
  });
  const terminal = isTerminalJobStatus(next.status);
  if (terminal) {
    await redis.set(jobKey(next.id), next, { ex: JOB_TTL_SECONDS });
  } else {
    await redis.set(jobKey(next.id), next);
  }
  await redis.zadd(RECENT_JOBS_KEY, { score: now, member: next.id });
  await trimRecentJobs(redis);
  if (next.cursorAgentId) {
    if (terminal) {
      await redis.set(agentKey(next.cursorAgentId), next.id, { ex: JOB_TTL_SECONDS });
    } else {
      await redis.set(agentKey(next.cursorAgentId), next.id);
    }
  }
  return next;
}

async function deleteJobKeys(
  redis: Awaited<ReturnType<typeof getRedis>>,
  job: Job | undefined,
  jobId: string,
) {
  await redis.del(jobKey(jobId));
  if (job?.cursorAgentId) {
    await redis.del(agentKey(job.cursorAgentId));
  }
}

async function trimRecentJobs(redis: Awaited<ReturnType<typeof getRedis>>) {
  const count = await redis.zcard(RECENT_JOBS_KEY);
  if (count <= MAX_RECENT_JOBS) return;
  const stale = await redis.zrange(RECENT_JOBS_KEY, 0, count - MAX_RECENT_JOBS - 1);
  if (!stale.length) return;
  for (const id of stale) {
    const jobId = String(id);
    const job = await redis.get<Job>(jobKey(jobId));
    // Drop payloads for missing/terminal jobs; keep active jobs addressable by id/agent.
    if (!job || isTerminalJobStatus(job.status)) {
      await deleteJobKeys(redis, job ?? undefined, jobId);
    }
  }
  await redis.zrem(RECENT_JOBS_KEY, ...stale);
}

/** Remove ZSET members whose job keys already expired / were deleted. */
export async function pruneMissingRecentJobs(): Promise<number> {
  if (!kvEnabled()) return 0;
  const redis = await getRedis();
  const ids = await redis.zrange(RECENT_JOBS_KEY, 0, -1);
  let pruned = 0;
  for (const id of ids) {
    const jobId = String(id);
    const exists = await redis.exists(jobKey(jobId));
    if (!exists) {
      await redis.zrem(RECENT_JOBS_KEY, jobId);
      pruned += 1;
    }
  }
  return pruned;
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
      const capped = capJobEvents(job);
      if (isTerminalJobStatus(capped.status)) {
        await redis.set(jobKey(capped.id), capped, { ex: JOB_TTL_SECONDS });
      } else {
        await redis.set(jobKey(capped.id), capped);
      }
      const score = Date.parse(capped.updatedAt || capped.createdAt) || Date.now();
      await redis.zadd(RECENT_JOBS_KEY, { score, member: capped.id });
      if (capped.cursorAgentId) {
        if (isTerminalJobStatus(capped.status)) {
          await redis.set(agentKey(capped.cursorAgentId), capped.id, {
            ex: JOB_TTL_SECONDS,
          });
        } else {
          await redis.set(agentKey(capped.cursorAgentId), capped.id);
        }
      }
      migrated += 1;
    }
  }
  await trimRecentJobs(redis);
  console.info(`[relay] Migrated ${migrated} jobs from blob to per-job keys`);
  return migrated;
}
