const DEFAULT_LOOKBACK_SEC = 2 * 24 * 60 * 60;

export function slackSearchAfterDate(now = new Date(), lookbackSec = DEFAULT_LOOKBACK_SEC) {
  const d = new Date(now.getTime() - lookbackSec * 1000);
  return d.toISOString().slice(0, 10);
}

export function buildSlackMentionSearchQuery(input: {
  triggerWord: string;
  mentionUserId?: string;
  now?: Date;
}) {
  const word = input.triggerWord.trim() || "pocketedge";
  const parts = [`${word}`, `@${word}`];
  if (input.mentionUserId) {
    parts.push(`<@${input.mentionUserId}>`);
  }
  const unique = [...new Set(parts)];
  return `(${unique.join(" OR ")}) after:${slackSearchAfterDate(input.now)}`;
}

export function slackTsInLookback(
  ts: string | undefined,
  nowSec = Date.now() / 1000,
  lookbackSec = DEFAULT_LOOKBACK_SEC,
) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return false;
  return value >= nowSec - lookbackSec;
}
