import {
  agentIsDone,
  conversationIncludesPrompt,
  extractAgentId,
  getAgent,
  getAgentConversation,
} from "@/lib/cursor-api";
import { settleAgentJob, isSettling, runArtifactFollowUp } from "@/lib/cursor-settle";
import { addJobEvent, getJob, listJobs, reclaimStaleDeliveringJobs } from "@/lib/jobs";
import {
  SETTLE_BACKOFF_SECONDS,
  SETTLE_POLL_MAX_ATTEMPTS,
} from "@/lib/qstash";
import { deliverReply } from "@/lib/relay";

declare global {
  var __relayCursorWaiter: { started: boolean; loopActive?: boolean } | undefined;
}

/** Local-only fallback. Production settle is webhook + QStash backoff. */
const SCAN_MS = 60_000;
const TIMEOUT_MS =
  SETTLE_BACKOFF_SECONDS.reduce((sum, seconds) => sum + seconds, 0) * 1000;
const inFlight = new Set<string>();

export function startCursorWaiter() {
  const state = globalThis.__relayCursorWaiter;
  if (state?.loopActive) {
    return;
  }
  globalThis.__relayCursorWaiter = { started: true, loopActive: true };
  console.info("[relay] Cursor waiter started (local polling fallback)");
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
      const { ACTIVE_JOB_SCAN_LIMIT } = await import("@/lib/job-store");
      const jobs = await listJobs(ACTIVE_JOB_SCAN_LIMIT);
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
    await sleep(SCAN_MS);
  }
}

export async function watchDispatchedJob(
  jobId: string,
  agentId: string,
  startedAt: number,
) {
  return waitAndSettle(jobId, agentId, startedAt);
}

function backoffMsForAge(ageMs: number) {
  let elapsed = 0;
  for (let i = 0; i < SETTLE_POLL_MAX_ATTEMPTS; i += 1) {
    const stepMs = SETTLE_BACKOFF_SECONDS[i]! * 1000;
    if (ageMs < elapsed + stepMs) return stepMs;
    elapsed += stepMs;
  }
  return SETTLE_BACKOFF_SECONDS[SETTLE_POLL_MAX_ATTEMPTS - 1]! * 1000;
}

async function waitAndSettle(jobId: string, agentId: string, startedAt: number) {
  const job = await getJob(jobId);
  while (true) {
    const ageMs = Date.now() - startedAt;
    if (ageMs > TIMEOUT_MS) {
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
        await sleep(backoffMsForAge(ageMs));
        continue;
      }
      if (current.followUpAgentId) {
        const conversation = await getAgentConversation(agentId);
        if (!conversationIncludesPrompt(conversation.messages ?? [], current.prompt)) {
          await sleep(backoffMsForAge(ageMs));
          continue;
        }
      }

      await settleAgentJob(jobId, agentId, { trigger: "poll" }).then((result) => {
        if (result.followUp) return runArtifactFollowUp(result.followUp);
      });
      return;
    } catch (error) {
      console.error(`[relay] Cursor wait failed for ${agentId}`, error);
      await sleep(backoffMsForAge(ageMs));
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
