import { getConfig } from "@/lib/config";
import { resolveJobFileForCursor } from "@/lib/attachments";
import { AUTOMATION_PROMPT } from "@/lib/automation-prompt";
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
  const artifactLine = ` For stocks, companies, ETFs, or any financial instrument, follow .cursor/skills/research/financial-analysis/SKILL.md. For long reports, write artifacts/<topic>-report.md; for short answers, reply in chat only. Relay forwards your final message and artifacts unchanged. Do NOT create PDF unless the user explicitly asks for PDF.`;
  const noPostLine = ` Do not POST to ${channel}, Relay, reply_url, or any other URL. Do not mention delivery, webhooks, or ${channel}.`;
  return `Answer the user's text.${fileLine}${artifactLine}${noPostLine}`;
}

export { AUTOMATION_PROMPT };

export async function buildCursorPayload(job: Job) {
  const cfg = getConfig();
  const files = [];
  for (const file of job.files ?? []) {
    files.push(await resolveJobFileForCursor(job, file));
  }

  const text = job.threadContext
    ? `${job.prompt}\n\n---\nSlack thread context (same conversation):\n${job.threadContext}`
    : job.prompt;

  const payload: Record<string, unknown> = {
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

  if (cfg.cursorStatusWebhookUrl && cfg.cursorStatusWebhookSecret) {
    payload.webhook = {
      url: cfg.cursorStatusWebhookUrl,
      secret: cfg.cursorStatusWebhookSecret,
    };
  }

  return payload;
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
