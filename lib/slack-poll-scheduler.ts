import { getConfig } from "@/lib/config";
import { updateStore } from "@/lib/store";

const MIN_WAKE_SEC = 30;
const MAX_WAKE_SEC = 120;

function qstashToken() {
  return process.env.QSTASH_TOKEN?.trim() || "";
}

/** Schedule the next /api/slack/poll wake. Prefer QStash; fall back to waitUntil self-fetch. */
export async function scheduleSlackPollWake(delaySec: number) {
  const cfg = getConfig();
  if (!cfg.vercel || !cfg.publicUrl || !cfg.slackUserPollConfigured) return;

  const delay = Math.max(MIN_WAKE_SEC, Math.min(MAX_WAKE_SEC, Math.ceil(delaySec)));

  if (qstashToken()) {
    await scheduleViaQStash(delay).catch((error) => {
      console.error("[relay] QStash Slack poll schedule failed", error);
    });
    return;
  }

  const claimed = await updateStore((data) => {
    const until = Date.parse(data.slackPollNextScheduledAt ?? "") || 0;
    const nextAt = Date.now() + delay * 1000;
    if (until > Date.now() + 10_000) return false;
    data.slackPollNextScheduledAt = new Date(nextAt).toISOString();
    return true;
  });
  if (!claimed) return;

  const { continueAfterResponse } = await import("@/lib/after-response");
  const { triggerSlackPollRequest } = await import("@/lib/slack-user-poller");
  continueAfterResponse(async () => {
    await sleep(delay * 1000);
    await triggerSlackPollRequest({ waitForComplete: false, force: true }).catch(
      (error) => {
        console.error("[relay] Slack poll self-wake failed", error);
      },
    );
  });
}

async function scheduleViaQStash(delaySec: number) {
  const { Client } = await import("@upstash/qstash");
  const cfg = getConfig();
  const secret = process.env.CRON_SECRET?.trim();
  const headers: Record<string, string> = {};
  if (secret) headers.Authorization = `Bearer ${secret}`;
  const client = new Client({ token: qstashToken() });
  await client.publishJSON({
    url: `${cfg.publicUrl}/api/slack/poll?force=1`,
    headers,
    delay: delaySec,
    deduplicationId: "relay-slack-poll",
  });
  await updateStore((data) => {
    data.slackPollNextScheduledAt = new Date(
      Date.now() + delaySec * 1000,
    ).toISOString();
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
