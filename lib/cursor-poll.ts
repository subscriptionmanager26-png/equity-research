import { listJobs, reclaimStaleDeliveringJobs } from "@/lib/jobs";
import { extractAgentId } from "@/lib/cursor-api";
import {
  settleAgentJob,
  isSettling,
  runArtifactFollowUp,
} from "@/lib/cursor-settle";
import { getAgent, agentIsDone } from "@/lib/cursor-api";

/** Settle any dispatched jobs whose Cursor agent has finished (cron / manual backup). */
export async function pollDispatchedJobs() {
  const reclaimed = await reclaimStaleDeliveringJobs();
  const jobs = await listJobs();
  let settled = 0;
  let artifactFollowUps = 0;

  for (const job of jobs) {
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
    scanned: jobs.filter((j) => j.status === "dispatched" || j.pendingArtifacts).length,
  };
}
