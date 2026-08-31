import { getConfig } from "@/lib/config";
import type { Job } from "@/lib/types";

export function replyUrl() {
  const { publicUrl } = getConfig();
  const path = "/api/reply";
  return publicUrl ? `${publicUrl}${path}` : path;
}

export function telegramSendUrl() {
  const { telegramBotToken } = getConfig();
  if (!telegramBotToken) return undefined;
  return `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
}

export function buildCursorPayload(job: Job) {
  const { replyWebhookSecret, publicUrl, telegramBotToken } = getConfig();
  const relayReplyUrl = publicUrl ? `${publicUrl}/api/reply` : undefined;
  const sendUrl = telegramBotToken
    ? `https://api.telegram.org/bot${telegramBotToken}/sendMessage`
    : undefined;

  const instructions = sendUrl && job.chatId
    ? [
        "Reply in Telegram. Do not wait for Relay to be publicly reachable.",
        `POST ${sendUrl}`,
        "Content-Type: application/json",
        `Body: { "chat_id": ${job.chatId}, "text": "<your answer>" }`,
        "If you fail, still send a short error to that same chat_id.",
        relayReplyUrl
          ? `Optionally also POST { job_id, status, message } to ${relayReplyUrl} with Authorization: Bearer <reply_token>.`
          : "Skip any reply_url that is not https.",
      ].join(" ")
    : [
        "When you finish, POST JSON to reply_url.",
        "Header: Authorization: Bearer <reply_token>",
        'Body: { "job_id": "<job_id>", "status": "finished", "message": "<your answer for Telegram>" }',
      ].join(" ");

  return {
    source: job.source,
    job_id: job.id,
    chat_id: job.chatId,
    username: job.username,
    from: job.displayName,
    text: job.prompt,
    telegram: sendUrl && job.chatId
      ? {
          chat_id: job.chatId,
          send_message_url: sendUrl,
        }
      : undefined,
    reply_url: relayReplyUrl,
    reply_token: relayReplyUrl ? replyWebhookSecret || undefined : undefined,
    instructions,
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
