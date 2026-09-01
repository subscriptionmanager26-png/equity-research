import { getConfig } from "@/lib/config";
import { resolveJobFileForCursor } from "@/lib/attachments";
import { AUTOMATION_PROMPT } from "@/lib/automation-prompt";
import { cursorPost } from "@/lib/cursor-api";
import type { Job } from "@/lib/types";

const DEFAULT_AGENT_REPO =
  "https://origin.cursor.com/kushagra-agarwal/equity-research";

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

export function useAutomationWebhook() {
  return process.env.CURSOR_USE_AUTOMATION_WEBHOOK === "true";
}

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

export function buildCloudAgentPrompt(
  job: Job,
  files: { name: string; url?: string; content_base64?: string }[],
) {
  const question = job.threadContext
    ? `${job.prompt}\n\n---\nSlack thread context (same conversation):\n${job.threadContext}`
    : job.prompt;
  const fileLines = files.map((file) => {
    if (file.url) return `- ${file.name}: ${file.url}`;
    return `- ${file.name} (inlined attachment)`;
  });
  const fileBlock = fileLines.length
    ? `\n\nAttached files (download immediately if a URL is present):\n${fileLines.join("\n")}`
    : "";
  return `${AUTOMATION_PROMPT}\n\n---\nUser question:\n${question}${fileBlock}\n\n${deliveryInstructions(job, files.length > 0)}`;
}

export async function buildCloudAgentBody(job: Job) {
  const cfg = getConfig();
  const files = [];
  for (const file of job.files ?? []) {
    files.push(await resolveJobFileForCursor(job, file));
  }
  const repository =
    process.env.CURSOR_AGENT_REPOSITORY?.trim() || DEFAULT_AGENT_REPO;
  const ref = process.env.CURSOR_AGENT_REF?.trim() || "main";
  const body: Record<string, unknown> = {
    prompt: { text: buildCloudAgentPrompt(job, files) },
    source: { repository, ref },
    target: { autoCreatePr: false },
    name: `Relay ${job.id.slice(0, 18)}`.slice(0, 100),
  };
  if (cfg.cursorStatusWebhookUrl && cfg.cursorStatusWebhookSecret) {
    body.webhook = {
      url: cfg.cursorStatusWebhookUrl,
      secret: cfg.cursorStatusWebhookSecret,
    };
  }
  return body;
}

export async function dispatchToCursor(job: Job) {
  const { cursorWebhookUrl, cursorWebhookToken } = getConfig();
  if (!cursorWebhookToken) {
    throw new Error("Cursor API token is not configured (CURSOR_WEBHOOK_TOKEN)");
  }

  if (useAutomationWebhook()) {
    if (!cursorWebhookUrl) {
      throw new Error("CURSOR_WEBHOOK_URL is required when CURSOR_USE_AUTOMATION_WEBHOOK=true");
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
    return { ok: response.ok, status: response.status, body };
  }

  const body = await buildCloudAgentBody(job);
  const created = await cursorPost("/v0/agents", body);
  if (created.ok) return created;

  const repository =
    process.env.CURSOR_AGENT_REPOSITORY?.trim() || DEFAULT_AGENT_REPO;
  const ref = process.env.CURSOR_AGENT_REF?.trim() || "main";
  const promptText = (body.prompt as { text: string }).text;
  const v1 = await cursorPost("/v1/agents", {
    prompt: { text: promptText },
    repos: [{ url: repository, startingRef: ref }],
    autoCreatePR: false,
    skipReviewerRequest: true,
  });
  return v1.ok ? v1 : created;
}
