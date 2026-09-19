import { listJobs, reclaimStaleDeliveringJobs } from "@/lib/jobs";
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
  for (const job of await listJobs()) {
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

/** Settle any dispatched jobs whose Cursor agent has finished (cron / manual backup). */
export async function pollDispatchedJobs(opts?: { maxMs?: number }) {
  const deadline = opts?.maxMs ? Date.now() + opts.maxMs : Number.POSITIVE_INFINITY;
  const reclaimed = await reclaimStaleDeliveringJobs(120_000);
  const queuedRetried = await retryStaleQueuedJobs();
  const jobs = await listJobs();
  let settled = 0;
  let artifactFollowUps = 0;

  for (const job of jobs) {
    if (Date.now() > deadline) break;
    if (job.pendingArtifacts && job.status === "replied") {
      await runArtifactFollowUp({
        jobId: job.id,
        agentId: job.pendingArtifacts.agentId,
        assistantText: job.reply?.message ?? "",
        job,
      }).catch((error) => {
        console.error(`[relay] artifact follow-up poll failed for ${job.id}`, error);
      });
      artifactFollowUps += 1;
      continue;
    }

    if (job.status !== "dispatched") continue;
    const agentId = job.cursorAgentId ?? extractAgentId(job.cursorBody);
    if (!agentId || isSettling(job.id)) continue;
    try {
      const agent = await getAgent(agentId);
      if (!agentIsDone(agent.status)) continue;
      const result = await settleAgentJob(job.id, agentId, { trigger: "poll" });
      if (result.ok) settled += 1;
      if (result.followUp) {
        await runArtifactFollowUp(result.followUp);
        artifactFollowUps += 1;
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
    scanned: jobs.filter((j) => j.status === "dispatched" || j.pendingArtifacts).length,
  };
}
