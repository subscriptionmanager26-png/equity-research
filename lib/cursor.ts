import { getConfig } from "@/lib/config";
import { telegramFileUrl } from "@/lib/telegram";
import type { Job } from "@/lib/types";

export function replyUrl() {
  const { publicUrl } = getConfig();
  const path = "/api/reply";
  return publicUrl ? `${publicUrl}${path}` : path;
}

export async function buildCursorPayload(job: Job) {
  const files = [];
  for (const file of job.files ?? []) {
    files.push({
      name: file.name,
      mime: file.mime,
      size: file.size,
      url: await telegramFileUrl(file.fileId),
    });
  }

  return {
    source: job.source,
    job_id: job.id,
    chat_id: job.chatId,
    username: job.username,
    from: job.displayName,
    text: job.prompt,
    files: files.length ? files : undefined,
    instructions: files.length
      ? "Answer the user's text. Download each files[].url immediately (they expire in about an hour) and use those files. If you produce a report or any file the user should receive, write it under artifacts/ (for example artifacts/report.pdf). PDF libraries are preinstalled (fpdf2, Pillow, reportlab) — import them, do not pip install. python3 tools/pdf_report.py artifacts/report.pdf \"Title\" \"Body\" is available. Relay sends artifacts/ files to Telegram. Do not POST to Telegram, Relay, or any other URL. Do not mention delivery, webhooks, or Telegram."
      : "Answer the user's text. If you produce a report or any file the user should receive, write it under artifacts/ (for example artifacts/report.pdf or artifacts/report.md). PDF libraries are preinstalled (fpdf2, Pillow, reportlab) — import them, do not pip install. python3 tools/pdf_report.py artifacts/report.pdf \"Title\" \"Body\" is available. Relay sends artifacts/ files to Telegram. Do not POST to Telegram, Relay, reply_url, or any other URL. Do not mention delivery, webhooks, or Telegram.",
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
