import {
  agentFailed,
  getAgent,
  getAgentConversation,
  getFinalAssistantAnswer,
} from "@/lib/cursor-api";
import {
  addJobEvent,
  getJob,
  listJobs,
} from "@/lib/jobs";
import { ACTIVE_JOB_SCAN_LIMIT } from "@/lib/job-store";
import { deliverReply, deliveryDetail } from "@/lib/relay";
import {
  agentIdForJob,
  assistantConversationText,
  normalizeAgentId,
} from "@/lib/cursor-settle";
import type { Job } from "@/lib/types";

const lateDelivering = new Set<string>();

export function normalizeDeliveryText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

export function isNewAssistantDelivery(
  latestAnswer: string | undefined,
  alreadyDelivered: string | undefined,
) {
  const next = normalizeDeliveryText(latestAnswer ?? "");
  if (!next) return false;
  const prev = normalizeDeliveryText(alreadyDelivered ?? "");
  if (!prev) return true;
  return next !== prev;
}

/**
 * Most recent replied Slack/Telegram job for this agent — used when Listening
 * wakes the same cloud agent after the ack was already delivered.
 */
export function findRepliedJobForAgent(jobs: Job[], agentId: string) {
  const target = normalizeAgentId(agentId);
  if (!target) return undefined;
  const matches = jobs.filter((job) => {
    if (job.status !== "replied") return false;
    if (job.source !== "slack" && job.source !== "telegram") return false;
    return agentIdForJob(job) === target;
  });
  matches.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return matches[0];
}

export async function findRepliedJobForAgentId(agentId: string) {
  const jobs = await listJobs(ACTIVE_JOB_SCAN_LIMIT);
  return findRepliedJobForAgent(jobs, agentId);
}

/** Heuristic: agent likely scheduled a Listening / timed remind wake. */
export function shouldWatchForLateDelivery(input: {
  agentStatus?: string;
  prompt?: string;
  answer?: string;
}) {
  const text = `${input.prompt ?? ""}\n${input.answer ?? ""}`;
  return /\bremind(er| me)?\b|\bin\s+\d+\s*(minutes?|mins?|hours?|hrs?)\b|\blistening\b|\bi['’]?ll ping\b/i.test(
    text,
  );
}

export type LateDeliveryResult = {
  ok: boolean;
  delivered: boolean;
  reason?: string;
  jobId?: string;
};

/**
 * If the cloud agent produced a newer assistant message after the job was
 * already marked replied (e.g. Listening reminder), post that delta to Slack/Telegram.
 */
export async function deliverAgentLateUpdate(
  jobId: string,
  agentId: string,
): Promise<LateDeliveryResult> {
  if (lateDelivering.has(jobId)) {
    return { ok: false, delivered: false, reason: "already_delivering", jobId };
  }

  lateDelivering.add(jobId);
  try {
    const job = await getJob(jobId);
    if (!job || job.status !== "replied") {
      return { ok: false, delivered: false, reason: "not_replied", jobId };
    }
    if (job.source !== "slack" && job.source !== "telegram") {
      return { ok: false, delivered: false, reason: "unsupported_source", jobId };
    }

    const agent = await getAgent(agentId);
    if (agentFailed(agent.status)) {
      return { ok: true, delivered: false, reason: "agent_failed", jobId };
    }

    const conversation = await getAgentConversation(agentId);
    const messages = conversation.messages ?? [];
    const answer = getFinalAssistantAnswer(messages);
    if (!isNewAssistantDelivery(answer, job.reply?.message)) {
      return { ok: true, delivered: false, reason: "no_new_message", jobId };
    }

    const message = answer!;
    const delivery = await deliverReply({
      jobId,
      job,
      status: "finished",
      message,
      files: [],
    });

    await addJobEvent(
      jobId,
      {
        type: "late_delivery",
        detail: `Late agent update delivered (${agentId}) · ${deliveryDetail(job, delivery)}`,
      },
      {
        status: "replied",
        cursorAgentId: agentId,
        reply: {
          message,
          status: agent.status ?? "finished",
          receivedAt: new Date().toISOString(),
          telegramMessageId:
            delivery.telegramMessageId ?? job.reply?.telegramMessageId,
          slackMessageTs: delivery.slackMessageTs ?? job.reply?.slackMessageTs,
          files: delivery.files.length
            ? delivery.files
            : job.reply?.files,
        },
      },
    );

    console.info(
      `[relay] Late-delivered ${jobId} for ${agentId} (${assistantConversationText(messages).length} chars conv)`,
    );
    return { ok: true, delivered: true, jobId };
  } catch (error) {
    console.error(`[relay] late delivery failed for ${jobId}`, error);
    return {
      ok: false,
      delivered: false,
      reason: error instanceof Error ? error.message : "error",
      jobId,
    };
  } finally {
    lateDelivering.delete(jobId);
  }
}
