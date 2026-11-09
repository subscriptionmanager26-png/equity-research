const QSTASH_SCHEDULE_ID = "relay-slack-poll-minute";

function qstashToken() {
  return process.env.QSTASH_TOKEN?.trim() || "";
}

/** Delete legacy QStash minute poll schedule on deploy (idempotent). */
export async function disableSlackPollSchedule() {
  if (!qstashToken()) return;

  const { Client } = await import("@upstash/qstash");
  const client = new Client({ token: qstashToken() });
  try {
    await client.schedules.delete(QSTASH_SCHEDULE_ID);
    console.info("[relay] Disabled legacy QStash Slack poll schedule");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("404")) {
      console.info("[relay] Legacy QStash Slack poll schedule already absent");
      return;
    }
    throw error;
  }
}
