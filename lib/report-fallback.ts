import type { Job } from "@/lib/types";

const REPORT_MIN_CHARS = 500;
const LOOKBACK_MS = 2 * 60 * 60 * 1000;

/**
 * User is explicitly asking Relay to resend a file from the current thread
 * (not a new research question that happens to contain the word "report").
 */
export function wantsPriorReportResend(prompt: string) {
  const p = prompt.toLowerCase();
  const resendIntent =
    /\b(did not|didn't|haven't|have not|not shared|not attach|without the|missing the|you did not|you have not)\b/.test(
      p,
    ) ||
    /\b(share|send|attach)\s+(it|the file|the markdown|again|now|asap)\b/.test(
      p,
    ) ||
    /\b(share|send|attach)\s+the\s+(markdown|file|report)\b/.test(p);
  const fileRef = /\b(file|markdown|\.md|attach|attached)\b/.test(p);
  return resendIntent && fileRef;
}

/**
 * Recover a report only when the user explicitly asks to resend a file in the
 * same Slack thread or Telegram chat thread — never across unrelated questions.
 */
export function findThreadReportResendFallback(
  job: Job | undefined,
  jobs: Job[],
): string | undefined {
  if (!job || !wantsPriorReportResend(job.prompt)) return undefined;

  const now = Date.now();
  const candidates = jobs.filter((other) => {
    if (other.id === job.id) return false;
    if (other.status !== "replied" || !other.reply?.message) return false;
    if (other.reply.message.length < REPORT_MIN_CHARS) return false;
    if (now - Date.parse(other.createdAt) > LOOKBACK_MS) return false;
    if (!sameConversation(job, other)) return false;
    return true;
  });

  candidates.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return candidates[0]?.reply?.message;
}

function sameConversation(a: Job, b: Job) {
  if (a.source !== b.source) return false;
  if (a.source === "slack") {
    return (
      Boolean(a.slackChannelId) &&
      a.slackChannelId === b.slackChannelId &&
      a.slackThreadTs === b.slackThreadTs &&
      a.slackUserId === b.slackUserId
    );
  }
  if (a.source === "telegram") {
    return a.chatId !== undefined && a.chatId === b.chatId;
  }
  return false;
}
