import {
  agentIsDone,
  extractAgentId,
  getAgent,
} from "@/lib/cursor-api";
import { settleAgentJob, isSettling } from "@/lib/cursor-settle";
import { addJobEvent, getJob, listJobs } from "@/lib/jobs";
import { deliverReply } from "@/lib/relay";

declare global {
  var __relayCursorWaiter: { started: boolean } | undefined;
}

const POLL_MS = 4000;
const BACKUP_POLL_MS = 12000;
const TIMEOUT_MS = 12 * 60 * 1000;
const inFlight = new Set<string>();

export function startCursorWaiter() {
  if (globalThis.__relayCursorWaiter?.started) return;
  globalThis.__relayCursorWaiter = { started: true };
  console.info("[relay] Cursor waiter started (polling fallback)");
  void loop();
}

async function loop() {
  const backupPollMs = process.env.PUBLIC_URL ? BACKUP_POLL_MS : POLL_MS;
  while (true) {
    try {
      const jobs = await listJobs();
      for (const job of jobs) {
        if (job.status !== "dispatched") continue;
        const agentId = job.cursorAgentId ?? extractAgentId(job.cursorBody);
        if (!agentId || inFlight.has(job.id) || isSettling(job.id)) continue;
        inFlight.add(job.id);
        void waitAndSettle(job.id, agentId, Date.parse(job.createdAt)).finally(
          () => {
            inFlight.delete(job.id);
          },
        );
      }
    } catch (error) {
      console.error("[relay] Cursor waiter scan failed", error);
    }
    await sleep(backupPollMs);
  }
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
          message: `Cursor started (${agentId}) but did not finish in time. Open https://cursor.com/agents/${agentId}`,
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

      await settleAgentJob(jobId, agentId, {
        trigger: "poll",
        initialArtifactDelayMs: 4000,
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
