import { getConfig } from "@/lib/config";
import type { Job } from "@/lib/types";

export function replyUrl() {
  const { publicUrl } = getConfig();
  const path = "/api/reply";
  return publicUrl ? `${publicUrl}${path}` : path;
}

export function buildCursorPayload(job: Job) {
  return {
    source: job.source,
    job_id: job.id,
    chat_id: job.chatId,
    username: job.username,
    from: job.displayName,
    text: job.prompt,
    instructions:
      "Answer the user's text. Do not POST to Telegram, Relay, reply_url, or any other URL. Do not mention delivery, webhooks, reply_url, or Telegram. Relay copies your final answer to the user automatically.",
  };
}

export async function dispatchToCursor(job: Job) {
  const { cursorWebhookUrl, cursorWebhookToken } = getConfig();
  if (!cursorWebhookUrl || !cursorWebhookToken) {
    throw new Error("Cursor webhook URL or token is not configured");
  }

  const payload = buildCursorPayload(job);
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
