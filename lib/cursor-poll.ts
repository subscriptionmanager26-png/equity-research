import { listJobs, reclaimStaleDeliveringJobs } from "@/lib/jobs";
import { ACTIVE_JOB_SCAN_LIMIT, pruneMissingRecentJobs } from "@/lib/job-store";
import { extractAgentId } from "@/lib/cursor-api";
import {
  settleAgentJob,
  isSettling,
  runArtifactFollowUp,
} from "@/lib/cursor-settle";
import { getAgent, agentIsDone } from "@/lib/cursor-api";
import { completeJobDispatch } from "@/lib/relay";
import type { Job } from "@/lib/types";

const STALE_QUEUED_MIN_MS = 90_000;
const STALE_QUEUED_MAX_MS = 24 * 60 * 60 * 1000;

function isStaleQueuedJob(job: Job, now: number) {
  if (job.status !== "queued") return false;
  const age = now - Date.parse(job.createdAt);
  if (age < STALE_QUEUED_MIN_MS || age > STALE_QUEUED_MAX_MS) return false;
  const events = job.events ?? [];
  if (events.some((e) => e.type === "dispatched" || e.type === "cursor_error")) {
    return false;
  }
  return true;
}

/** Re-dispatch jobs stuck in queued after the initial serverless attempt timed out. */
export async function retryStaleQueuedJobs(opts?: { max?: number }) {
  const now = Date.now();
  const max = opts?.max ?? 2;
  let retried = 0;
  for (const job of await listJobs(ACTIVE_JOB_SCAN_LIMIT)) {
    if (retried >= max) break;
    if (!isStaleQueuedJob(job, now)) continue;
    console.info(`[relay] Retrying stale queued job ${job.id}`);
    await completeJobDispatch(job).catch((error) => {
      console.error(`[relay] retryStaleQueuedJobs failed for ${job.id}`, error);
    });
    retried += 1;
  }
  return retried;
}

export type SettleOneResult =
  | { status: "settled"; artifactFollowUp: boolean }
  | { status: "waiting" }
  | { status: "skipped"; reason: string };

/** Check one dispatched job — used by the post-message 30s settle chain. */
export async function settleDispatchedJob(job: Job): Promise<SettleOneResult> {
  if (job.pendingArtifacts && job.status === "replied") {
    await runArtifactFollowUp({
      jobId: job.id,
      agentId: job.pendingArtifacts.agentId,
      assistantText: job.reply?.message ?? "",
      job,
    });
    return { status: "settled", artifactFollowUp: true };
  }
  if (job.status !== "dispatched") {
    return { status: "skipped", reason: job.status };
  }
  const agentId = job.cursorAgentId ?? extractAgentId(job.cursorBody);
  if (!agentId) return { status: "skipped", reason: "no_agent" };
  if (isSettling(job.id)) return { status: "waiting" };

  const agent = await getAgent(agentId);
  if (!agentIsDone(agent.status)) return { status: "waiting" };

  const result = await settleAgentJob(job.id, agentId, { trigger: "poll" });
  if (!result.ok) return { status: "waiting" };
  if (result.followUp) {
    await runArtifactFollowUp(result.followUp);
    return { status: "settled", artifactFollowUp: true };
  }
  return { status: "settled", artifactFollowUp: false };
}

/** Settle any dispatched jobs whose Cursor agent has finished (manual catch-up). */
export async function pollDispatchedJobs(opts?: { maxMs?: number }) {
  const deadline = opts?.maxMs ? Date.now() + opts.maxMs : Number.POSITIVE_INFINITY;
  const pruned = await pruneMissingRecentJobs(25).catch(() => 0);
  const reclaimed = await reclaimStaleDeliveringJobs(120_000);
  const queuedRetried = await retryStaleQueuedJobs();
  const jobs = await listJobs(ACTIVE_JOB_SCAN_LIMIT);
  let settled = 0;
  let artifactFollowUps = 0;

  for (const job of jobs) {
    if (Date.now() > deadline) break;
    try {
      const result = await settleDispatchedJob(job);
      if (result.status === "settled") {
        settled += 1;
        if (result.artifactFollowUp) artifactFollowUps += 1;
      }
    } catch (error) {
      console.error(`[relay] pollDispatchedJobs failed for ${job.id}`, error);
    }
  }
  return {
    settled,
    artifactFollowUps,
    reclaimed,
    queuedRetried,
    pruned,
    scanned: jobs.filter((j) => j.status === "dispatched" || j.pendingArtifacts).length,
  };
}
