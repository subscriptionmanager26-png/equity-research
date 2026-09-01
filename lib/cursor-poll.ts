import { listJobs } from "@/lib/jobs";
import { extractAgentId } from "@/lib/cursor-api";
import { settleAgentJob, isSettling } from "@/lib/cursor-settle";
import { getAgent, agentIsDone } from "@/lib/cursor-api";

/** Settle any dispatched jobs whose Cursor agent has finished (cron / manual backup). */
export async function pollDispatchedJobs() {
  const jobs = await listJobs();
  let settled = 0;
  for (const job of jobs) {
    if (job.status !== "dispatched") continue;
    const agentId = job.cursorAgentId ?? extractAgentId(job.cursorBody);
    if (!agentId || isSettling(job.id)) continue;
    try {
      const agent = await getAgent(agentId);
      if (!agentIsDone(agent.status)) continue;
      const result = await settleAgentJob(job.id, agentId, { trigger: "poll" });
      if (result.ok) settled += 1;
    } catch (error) {
      console.error(`[relay] pollDispatchedJobs failed for ${job.id}`, error);
    }
  }
  return { settled, scanned: jobs.filter((j) => j.status === "dispatched").length };
}
