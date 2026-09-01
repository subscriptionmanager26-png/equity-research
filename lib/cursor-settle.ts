import {
  agentFailed,
  extractAgentId,
  getAgent,
  getAgentConversation,
  getFinalAssistantAnswer,
} from "@/lib/cursor-api";
import { userRequestedPdf } from "@/lib/automation-prompt";
import { followUpArtifacts } from "@/lib/artifact-followup";
import {
  collectAgentFilesWithRetry,
  extractMentionedArtifactPaths,
  mentionedArtifactsMissing,
} from "@/lib/artifact-collect";
import { findThreadReportResendFallback } from "@/lib/report-fallback";
import { addJobEvent, getJob, listJobs } from "@/lib/jobs";
import { deliverReply, deliveryDetail } from "@/lib/relay";
import type { Job } from "@/lib/types";

const settling = new Set<string>();
const seenWebhookIds = new Set<string>();
const MAX_WEBHOOK_IDS = 500;

export function normalizeAgentId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("bc_")) return `bc-${trimmed.slice(3)}`;
  return trimmed;
}

export function agentIdForJob(job: Job) {
  const raw = job.cursorAgentId ?? extractAgentId(job.cursorBody);
  return raw ? normalizeAgentId(raw) : undefined;
}

export function findDispatchedJobForAgent(jobs: Job[], agentId: string) {
  const target = normalizeAgentId(agentId);
  if (!target) return undefined;
  return jobs.find((job) => {
    if (job.status !== "dispatched") return false;
    return agentIdForJob(job) === target;
  });
}

/** Dedupe Cursor status webhook retries. Returns false if already seen. */
export function markWebhookSeen(webhookId: string) {
  if (!webhookId) return true;
  if (seenWebhookIds.has(webhookId)) return false;
  seenWebhookIds.add(webhookId);
  if (seenWebhookIds.size > MAX_WEBHOOK_IDS) {
    const first = seenWebhookIds.values().next().value;
    if (first) seenWebhookIds.delete(first);
  }
  return true;
}

export function isSettling(jobId: string) {
  return settling.has(jobId);
}

export type SettleOptions = {
  trigger?: "poll" | "webhook";
  initialArtifactDelayMs?: number;
  artifactAttempts?: number;
  artifactDelayMs?: number;
};

function artifactCollectionOptions(options: SettleOptions) {
  const trigger = options.trigger ?? "poll";
  if (trigger === "webhook") {
    return {
      initialDelayMs: options.initialArtifactDelayMs ?? 500,
      attempts: options.artifactAttempts ?? 4,
      delayMs: options.artifactDelayMs ?? 1500,
    };
  }
  return {
    initialDelayMs: options.initialArtifactDelayMs ?? 1000,
    attempts: options.artifactAttempts ?? 5,
    delayMs: options.artifactDelayMs ?? 2000,
  };
}

/** Assistant messages only — avoids boilerplate paths from the automation prompt. */
export function assistantConversationText(
  messages: { type?: string; text?: string }[],
) {
  return messages
    .filter((message) => message.type === "assistant_message")
    .map((message) => message.text ?? "")
    .join("\n");
}

/**
 * Fetch the agent answer + artifacts and deliver to Telegram/Slack.
 * Safe to call from the status webhook and the polling fallback.
 */
export async function settleAgentJob(
  jobId: string,
  agentId: string,
  options: SettleOptions = {},
): Promise<{ ok: boolean; reason?: string }> {
  if (settling.has(jobId)) {
    return { ok: false, reason: "already_settling" };
  }

  const job = await getJob(jobId);
  if (!job) return { ok: false, reason: "job_not_found" };
  if (job.status !== "dispatched") {
    return { ok: false, reason: "already_replied" };
  }

  settling.add(jobId);
  try {
    const trigger = options.trigger ?? "poll";
    const artifactOptions = artifactCollectionOptions(options);

    const agent = await getAgent(agentId);
    const conversation = await getAgentConversation(agentId);
    const messages = conversation.messages ?? [];
    const assistantText = assistantConversationText(messages);
    const answer = getFinalAssistantAnswer(messages);
    const failed = agentFailed(agent.status);
    const allowPdf = userRequestedPdf(job.prompt ?? "");
    const collected = failed
      ? []
      : await collectAgentFilesWithRetry(agentId, assistantText, artifactOptions).catch(
          () => [],
        );
    const files = allowPdf
      ? collected
      : collected.filter((file) => !/\.pdf$/i.test(file.name));
    const link =
      agent.url ?? agent.target?.url ?? `https://cursor.com/agents/${agentId}`;
    let message =
      answer ||
      (files.length
        ? `Cursor attached ${files.length} file${files.length === 1 ? "" : "s"}.`
        : failed
          ? `Cursor agent ended with ${agent.status}. ${link}`
          : `Cursor finished but did not leave a text answer. ${link}`);

    if (!failed && files.length === 0) {
      const resend = findThreadReportResendFallback(job, await listJobs());
      if (resend) {
        console.info(
          `[relay] Resending prior thread report for ${jobId} (${resend.length} chars)`,
        );
        message = resend;
      }
    }

    const missingArtifacts = mentionedArtifactsMissing(assistantText, files);
    if (missingArtifacts.length && !failed && files.length === 0) {
      message += `\n\n_Note: Cursor did not publish ${missingArtifacts.join(", ")} to the artifacts API yet. Relay will retry the file attachment — or open ${link} to download it._`;
    }

    const delivery = await deliverReply({
      jobId,
      job,
      status: failed ? "error" : "finished",
      message,
      files,
    });

    await addJobEvent(
      jobId,
      {
        type: trigger === "webhook" ? "cursor_status" : "replied",
        detail:
          trigger === "webhook"
            ? `Cursor status webhook delivered ${agentId}`
            : deliveryDetail(job, delivery),
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

    console.info(
      `[relay] Settled ${jobId} via ${trigger} (${agentId}) — ${delivery.files.length} file(s)`,
    );

    if (!failed && delivery.files.length === 0 && extractMentionedArtifactPaths(assistantText).length) {
      void followUpArtifacts(jobId, agentId, assistantText, job).catch((error) => {
        console.error(`[relay] Artifact follow-up failed for ${jobId}`, error);
      });
    }

    return { ok: true };
  } catch (error) {
    console.error(`[relay] settleAgentJob failed for ${jobId}`, error);
    return { ok: false, reason: "error" };
  } finally {
    settling.delete(jobId);
  }
}
