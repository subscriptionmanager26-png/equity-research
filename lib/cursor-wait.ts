import {
  agentFailed,
  agentIsDone,
  collectAgentFiles,
  extractAgentId,
  getAgent,
  getAgentAnswer,
  mimeFromName,
} from "@/lib/cursor-api";
import { addJobEvent, listJobs } from "@/lib/jobs";
import { deliverReply } from "@/lib/relay";

declare global {
  var __relayCursorWaiter: { started: boolean } | undefined;
}

const POLL_MS = 4000;
const TIMEOUT_MS = 12 * 60 * 1000;
const inFlight = new Set<string>();

export function startCursorWaiter() {
  if (globalThis.__relayCursorWaiter?.started) return;
  globalThis.__relayCursorWaiter = { started: true };
  console.info("[relay] Cursor waiter started");
  void loop();
}

async function loop() {
  while (true) {
    try {
      const jobs = await listJobs();
      for (const job of jobs) {
        if (job.status !== "dispatched") continue;
        const agentId = job.cursorAgentId ?? extractAgentId(job.cursorBody);
        if (!agentId || inFlight.has(job.id)) continue;
        inFlight.add(job.id);
        void settleJob(job.id, agentId, Date.parse(job.createdAt)).finally(() => {
          inFlight.delete(job.id);
        });
      }
    } catch (error) {
      console.error("[relay] Cursor waiter scan failed", error);
    }
    await sleep(POLL_MS);
  }
}

async function settleJob(jobId: string, agentId: string, startedAt: number) {
  while (true) {
    if (Date.now() - startedAt > TIMEOUT_MS) {
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
        status: "error",
        message: `Cursor started (${agentId}) but did not finish in time. Open https://cursor.com/agents/${agentId}`,
      }).catch(() => undefined);
      return;
    }

    try {
      const agent = await getAgent(agentId);
      if (!agentIsDone(agent.status)) {
        await sleep(POLL_MS);
        continue;
      }

      const answer = await getAgentAnswer(agentId);
      const failed = agentFailed(agent.status);
      const artifacts = failed ? [] : await collectAgentFiles(agentId).catch(() => []);
      const files = [...artifacts];
      if (!failed && !files.length && answer && answer.length > 2000) {
        files.push({
          name: "report.md",
          bytes: new TextEncoder().encode(answer),
          mime: mimeFromName("report.md"),
        });
      }
      const link = agent.url ?? agent.target?.url ?? `https://cursor.com/agents/${agentId}`;
      const message =
        answer ||
        (files.length
          ? `Cursor attached ${files.length} file${files.length === 1 ? "" : "s"}.`
          : failed
            ? `Cursor agent ended with ${agent.status}. ${link}`
            : `Cursor finished but did not leave a text answer. ${link}`);

      const delivery = await deliverReply({
        jobId,
        status: failed ? "error" : "finished",
        message,
        files,
      });
      const fileNote = delivery.files?.length
        ? ` with ${delivery.files.join(", ")}`
        : "";
      await addJobEvent(
        jobId,
        {
          type: "replied",
          detail: delivery.chatId
            ? `Delivered Cursor result to Telegram chat ${delivery.chatId}${fileNote}`
            : "Stored Cursor result (no Telegram chat)",
        },
        {
          status: failed ? "error" : "replied",
          error: failed ? message : undefined,
          cursorAgentId: agentId,
          reply: {
            message,
            status: agent.status ?? "finished",
            receivedAt: new Date().toISOString(),
            telegramMessageId: delivery.telegramMessageId,
            files: delivery.files,
          },
        },
      );
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
