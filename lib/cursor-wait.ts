import {
  agentFailed,
  agentIsDone,
  extractAgentId,
  getAgent,
  getAgentDeliveryAnswer,
} from "@/lib/cursor-api";
import { userRequestedPdf } from "@/lib/automation-prompt";
import {
  collectAgentFilesWithRetry,
  mentionedArtifactsMissing,
} from "@/lib/artifact-collect";
import {
  findThreadReportResendFallback,
} from "@/lib/report-fallback";
import { reportFilenameFor } from "@/lib/report-filename";
import { addJobEvent, getJob, listJobs } from "@/lib/jobs";
import { deliverReply, deliveryDetail } from "@/lib/relay";

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
  const job = await getJob(jobId);
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
        job,
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

      const answer = await getAgentDeliveryAnswer(agentId);
      const failed = agentFailed(agent.status);
      const allowPdf = userRequestedPdf(job?.prompt ?? "");
      const collected = failed
        ? []
        : await collectAgentFilesWithRetry(agentId, answer).catch(() => []);
      const files = allowPdf
        ? collected
        : collected.filter((file) => !/\.pdf$/i.test(file.name));
      const link = agent.url ?? agent.target?.url ?? `https://cursor.com/agents/${agentId}`;
      let message =
        answer ||
        (files.length
          ? `Cursor attached ${files.length} file${files.length === 1 ? "" : "s"}.`
          : failed
            ? `Cursor agent ended with ${agent.status}. ${link}`
            : `Cursor finished but did not leave a text answer. ${link}`);

      if (!failed && files.length === 0 && message.length < 500) {
        const resend = findThreadReportResendFallback(job, await listJobs());
        if (resend) {
          console.info(
            `[relay] Resending prior thread report for ${jobId} (${resend.length} chars)`,
          );
          message = resend;
        }
      }

      const missingArtifacts = mentionedArtifactsMissing(answer, files);
      if (missingArtifacts.length && !failed && files.length === 0) {
        message += `\n\n_Note: Cursor did not publish ${missingArtifacts.join(", ")} to the artifacts API. Relay attached the report from the agent text instead._`;
      }

      const reportFilename = job
        ? reportFilenameFor(job, message, files)
        : "report.md";

      const delivery = await deliverReply({
        jobId,
        job,
        status: failed ? "error" : "finished",
        message,
        files,
        reportFilename,
      });
      await addJobEvent(
        jobId,
        {
          type: "replied",
          detail: deliveryDetail(job, delivery),
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
            slackMessageTs: delivery.slackMessageTs,
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
