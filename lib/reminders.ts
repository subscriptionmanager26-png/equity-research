/** Relay-owned timed reminds (Slack/Telegram). Does not depend on Cursor Listening. */

const MAX_RELAY_REMIND_SECONDS = 48 * 60 * 60; // 48h
const MIN_RELAY_REMIND_SECONDS = 60;

export type ParsedReminder = {
  delaySeconds: number;
  task: string;
  label: string;
};

function unitToSeconds(amount: number, unit: string) {
  const value = unit.toLowerCase();
  if (value.startsWith("h")) return amount * 3600;
  return amount * 60;
}

function cleanTask(task: string) {
  return task
    .replace(/^[\s.,:;!?-]+/, "")
    .replace(/[\s.,:;!?-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse short timed reminds like:
 * - "remind in 3 mins to turn off laptop"
 * - "remind me in 5 minutes to close my laptop"
 * - "in 10 mins remind me to call mom"
 */
export function parseTimedReminder(text: string): ParsedReminder | null {
  const body = text.trim();
  if (!body) return null;

  // Longer unit tokens first so "minutes" is not eaten as "min" + "utes…".
  const unit = "minutes?|mins?|hours?|hrs?";
  const patterns: RegExp[] = [
    new RegExp(
      String.raw`\bremind(?:\s+me)?\s+in\s+(\d+)\s*(${unit})\s*(?:to\s+)?(.+)?$`,
      "i",
    ),
    new RegExp(
      String.raw`\bin\s+(\d+)\s*(${unit})\s*,?\s*remind(?:\s+me)?\s*(?:to\s+)?(.+)?$`,
      "i",
    ),
    new RegExp(
      String.raw`\bremind(?:\s+me)?\s+to\s+(.+?)\s+in\s+(\d+)\s*(${unit})\s*$`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (!match) continue;

    // Pattern 3 has task before amount.
    if (pattern.source.startsWith("\\bremind(?:\\s+me)?\\s+to\\s+")) {
      const task = cleanTask(match[1] ?? "");
      const amount = Number(match[2]);
      const unit = match[3] ?? "minutes";
      if (!Number.isFinite(amount) || amount <= 0 || !task) continue;
      const delaySeconds = unitToSeconds(amount, unit);
      if (
        delaySeconds < MIN_RELAY_REMIND_SECONDS ||
        delaySeconds > MAX_RELAY_REMIND_SECONDS
      ) {
        return null;
      }
      return {
        delaySeconds,
        task,
        label: formatRemindDelay(delaySeconds),
      };
    }

    const amount = Number(match[1]);
    const unit = match[2] ?? "minutes";
    const task = cleanTask(match[3] ?? "this");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const delaySeconds = unitToSeconds(amount, unit);
    if (
      delaySeconds < MIN_RELAY_REMIND_SECONDS ||
      delaySeconds > MAX_RELAY_REMIND_SECONDS
    ) {
      return null;
    }
    return {
      delaySeconds,
      task: task || "this",
      label: formatRemindDelay(delaySeconds),
    };
  }

  return null;
}

export function formatRemindDelay(delaySeconds: number) {
  if (delaySeconds % 3600 === 0) {
    const hours = delaySeconds / 3600;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const minutes = Math.round(delaySeconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function reminderAckText(reminder: ParsedReminder) {
  const task =
    reminder.task === "this" ? "ping you" : reminder.task;
  if (reminder.task === "this") {
    return `Got it — I’ll remind you in ${reminder.label}.`;
  }
  return `Got it — I’ll remind you in ${reminder.label} to ${task}.`;
}

export function reminderFireText(reminder: ParsedReminder) {
  if (reminder.task === "this") {
    return `Reminder: time’s up.`;
  }
  return `Reminder: ${reminder.task}`;
}

export function isRelayOwnedReminder(text: string) {
  return Boolean(parseTimedReminder(text));
}
