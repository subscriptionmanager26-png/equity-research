import type { Job } from "@/lib/types";

const REPORT_MIN_CHARS = 500;
const LOOKBACK_MS = 4 * 60 * 60 * 1000;

/** User is asking for a file or the agent claimed one exists. */
export function expectsReportFile(prompt: string, answer?: string) {
  const text = `${prompt}\n${answer ?? ""}`.toLowerCase();
  return (
    /\b(markdown|\.md|share.*file|send.*file|attach|report)\b/.test(text) ||
    /artifacts\/[\w./-]+\.(md|markdown)/i.test(text)
  );
}

/** Recover a long report from an earlier job in the same Slack/Telegram conversation. */
export function findRecentReportFallback(job: Job | undefined, jobs: Job[]) {
  if (!job) return undefined;
  const now = Date.now();
  const candidates = jobs.filter((other) => {
    if (other.id === job.id) return false;
    if (other.status !== "replied" || !other.reply?.message) return false;
    if (other.reply.message.length < REPORT_MIN_CHARS) return false;
    if (now - Date.parse(other.createdAt) > LOOKBACK_MS) return false;
    if (!sameActor(job, other)) return false;
    return true;
  });

  const sameThread = candidates.filter(
    (other) =>
      job.slackChannelId &&
      other.slackChannelId === job.slackChannelId &&
      other.slackThreadTs === job.slackThreadTs,
  );
  const pool = sameThread.length ? sameThread : candidates;
  pool.sort(
    (a, b) => (b.reply?.message.length ?? 0) - (a.reply?.message.length ?? 0),
  );
  return pool[0]?.reply?.message;
}

function sameActor(a: Job, b: Job) {
  if (a.source !== b.source) return false;
  if (a.source === "slack") {
    return Boolean(a.slackUserId && a.slackUserId === b.slackUserId);
  }
  if (a.source === "telegram") {
    return a.chatId !== undefined && a.chatId === b.chatId;
  }
  return true;
}
