import {
  agentIsDone,
  conversationIncludesPrompt,
  extractAgentId,
  getAgent,
  getAgentConversation,
} from "@/lib/cursor-api";
import { settleAgentJob, isSettling, runArtifactFollowUp } from "@/lib/cursor-settle";
import { addJobEvent, getJob, listJobs, reclaimStaleDeliveringJobs } from "@/lib/jobs";
import { deliverReply } from "@/lib/relay";

declare global {
  var __relayCursorWaiter: { started: boolean; loopActive?: boolean } | undefined;
}

const POLL_MS = 4000;
const TIMEOUT_MS = 12 * 60 * 1000;
const inFlight = new Set<string>();

export function startCursorWaiter() {
  const state = globalThis.__relayCursorWaiter;
  if (state?.loopActive) {
    return;
  }
  globalThis.__relayCursorWaiter = { started: true, loopActive: true };
  console.info("[relay] Cursor waiter started (polling fallback)");
  void loop().finally(() => {
    if (globalThis.__relayCursorWaiter) {
      globalThis.__relayCursorWaiter.loopActive = false;
    }
  });
}

async function loop() {
  while (true) {
    try {
      await reclaimStaleDeliveringJobs();
      const jobs = await listJobs();
      for (const job of jobs) {
        if (job.status !== "dispatched") continue;
        const agentId = job.cursorAgentId ?? extractAgentId(job.cursorBody);
        if (!agentId || inFlight.has(job.id) || isSettling(job.id)) continue;
        inFlight.add(job.id);
        console.info(`[relay] Polling fallback picked up ${job.id} (${agentId})`);
        void waitAndSettle(job.id, agentId, Date.parse(job.createdAt)).finally(
          () => {
            inFlight.delete(job.id);
          },
        );
      }
    } catch (error) {
      console.error("[relay] Cursor waiter scan failed", error);
    }
    await sleep(POLL_MS);
  }
}

export async function watchDispatchedJob(
  jobId: string,
  agentId: string,
  startedAt: number,
) {
  return waitAndSettle(jobId, agentId, startedAt);
}

async function waitAndSettle(jobId: string, agentId: string, startedAt: number) {
  const job = await getJob(jobId);
  while (true) {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      const current = await getJob(jobId);
      if (current?.status === "dispatched") {
        await addJobEvent(
          jobId,
          {
            type: "cursor_timeout",
            detail: `Timed out waiting for ${agentId}`,
          },
          { status: "error", error: "Cursor agent did not finish in time" },
        );
        await deliverReply({
          jobId,
          job,
          status: "error",
          message: `Cursor started but did not finish in time. Check the Relay dashboard for this job.`,
        }).catch(() => undefined);
      }
      return;
    }

    try {
      const current = await getJob(jobId);
      if (current?.status !== "dispatched") {
        return;
      }

      const agent = await getAgent(agentId);
      if (!agentIsDone(agent.status)) {
        await sleep(POLL_MS);
        continue;
      }
      if (current.followUpAgentId) {
        const conversation = await getAgentConversation(agentId);
        if (!conversationIncludesPrompt(conversation.messages ?? [], current.prompt)) {
          await sleep(POLL_MS);
          continue;
        }
      }

      await settleAgentJob(jobId, agentId, { trigger: "poll" }).then((result) => {
        if (result.followUp) return runArtifactFollowUp(result.followUp);
      });
      return;
    } catch (error) {
      console.error(`[relay] Cursor wait failed for ${agentId}`, error);
      await sleep(POLL_MS);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
