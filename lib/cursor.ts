import { getConfig } from "@/lib/config";
import { resolveJobFileForCursor } from "@/lib/attachments";
import type { Job } from "@/lib/types";

export function replyUrl() {
  const { publicUrl } = getConfig();
  const path = "/api/reply";
  return publicUrl ? `${publicUrl}${path}` : path;
}

function deliveryInstructions(job: Job, hasFiles: boolean) {
  const channel =
    job.source === "slack"
      ? "Slack thread"
      : job.source === "telegram"
        ? "Telegram"
        : "the user";
  const fileLine = hasFiles
    ? " Download each files[].url immediately (they expire in about an hour). If a file has content_base64 instead of url, decode that base64 payload."
    : "";
  const artifactLine = ` For reports or long answers, write a markdown file under artifacts/ (for example artifacts/report.md) using the Write tool. Prefer markdown over PDF — it is faster and Relay delivers .md files to Telegram and Slack. Relay only sends files registered under artifacts/. Verify the file exists before saying it is attached.`;
  const noPostLine = ` Do not POST to ${channel}, Relay, reply_url, or any other URL. Do not mention delivery, webhooks, or ${channel}.`;
  return `Answer the user's text.${fileLine}${artifactLine}${noPostLine}`;
}

export async function buildCursorPayload(job: Job) {
  const files = [];
  for (const file of job.files ?? []) {
    files.push(await resolveJobFileForCursor(job, file));
  }

  const text = job.threadContext
    ? `${job.prompt}\n\n---\nSlack thread context (same conversation):\n${job.threadContext}`
    : job.prompt;

  return {
    source: job.source,
    job_id: job.id,
    chat_id: job.chatId,
    slack_channel_id: job.slackChannelId,
    slack_thread_ts: job.slackThreadTs,
    slack_user_id: job.slackUserId,
    username: job.username,
    from: job.displayName,
    text,
    thread_context: job.threadContext,
    files: files.length ? files : undefined,
    instructions: deliveryInstructions(job, files.length > 0),
  };
}

export async function dispatchToCursor(job: Job) {
  const { cursorWebhookUrl, cursorWebhookToken } = getConfig();
  if (!cursorWebhookUrl || !cursorWebhookToken) {
    throw new Error("Cursor webhook URL or token is not configured");
  }

  const payload = await buildCursorPayload(job);
  const response = await fetch(cursorWebhookUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cursorWebhookToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}
