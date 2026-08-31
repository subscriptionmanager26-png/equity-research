import { getConfig } from "@/lib/config";
import type { Job } from "@/lib/types";

export function replyUrl() {
  const { publicUrl } = getConfig();
  const path = "/api/reply";
  return publicUrl ? `${publicUrl}${path}` : path;
}

export function buildCursorPayload(job: Job) {
  const { replyWebhookSecret, publicUrl } = getConfig();
  const url = publicUrl ? `${publicUrl}/api/reply` : "(set PUBLIC_URL)";

  return {
    source: job.source,
    job_id: job.id,
    chat_id: job.chatId,
    username: job.username,
    from: job.displayName,
    text: job.prompt,
    reply_url: url,
    reply_token: replyWebhookSecret || undefined,
    instructions: [
      "When you finish, POST JSON to reply_url.",
      "Header: Authorization: Bearer <reply_token>",
      'Body: { "job_id": "<job_id>", "status": "finished", "message": "<your answer for Telegram>" }',
      "If you fail, still POST with status \"error\" and a short explanation.",
    ].join(" "),
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
