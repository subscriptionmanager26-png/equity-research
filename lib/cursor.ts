import { getConfig } from "@/lib/config";
import { resolveJobFileForCursor } from "@/lib/attachments";
import { AUTOMATION_PROMPT } from "@/lib/automation-prompt";
import { cursorPost } from "@/lib/cursor-api";
import {
  listCursorTokenSlots,
  orderCursorTokenSlots,
  shouldFailoverCursorCreate,
  withCursorToken,
  type CursorTokenSlot,
} from "@/lib/cursor-token";
import type { Job } from "@/lib/types";

const DEFAULT_AGENT_REPO =
  "https://github.com/subscriptionmanager26-png/equity-research";

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
    ? " Download each files[].url as soon as you start (Relay attachment links stay available for the job). If a file has content_base64 instead of url, decode that base64 payload."
    : "";
  const artifactLine = ` For stocks, companies, ETFs, or any financial instrument, follow .cursor/skills/research/financial-analysis/SKILL.md. For long reports, write the file to artifacts/<topic>-report.md AND copy the same file to /opt/cursor/artifacts/<topic>-report.md (Relay only receives the /opt/cursor/artifacts copy). Short answers stay in chat only. Do NOT create PDF unless the user explicitly asks for PDF.`;
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
  };
  const v0Model = cloudAgentModelV0();
  const v1Model = cloudAgentModelSelection();
  if (v0Model) body.model = v0Model;
  else if (v1Model) body.model = v1Model;
  if (cfg.cursorStatusWebhookUrl && cfg.cursorStatusWebhookSecret) {
    body.webhook = {
      url: cfg.cursorStatusWebhookUrl,
      secret: cfg.cursorStatusWebhookSecret,
    };
  }
  return body;
}

export function standingAgentId() {
  if (process.env.CURSOR_REUSE_AGENT !== "true") return "";
  return process.env.CURSOR_AGENT_ID?.trim() || "";
}

/** v1 model selection from CURSOR_AGENT_MODEL + optional CURSOR_AGENT_MODEL_PARAMS. */
export function cloudAgentModelSelection():
  | { id: string; params?: { id: string; value: string }[] }
  | undefined {
  const id = process.env.CURSOR_AGENT_MODEL?.trim();
  if (!id) return undefined;
  const params = parseModelParams(process.env.CURSOR_AGENT_MODEL_PARAMS);
  return params.length ? { id, params } : { id };
}

function parseModelParams(raw?: string) {
  const params: { id: string; value: string }[] = [];
  for (const part of (raw ?? "").split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    params.push({
      id: trimmed.slice(0, eq).trim(),
      value: trimmed.slice(eq + 1).trim(),
    });
  }
  return params;
}

/** v0 create uses a single model string when no params are set. */
function cloudAgentModelV0() {
  const selection = cloudAgentModelSelection();
  if (!selection) return undefined;
  if (selection.params?.length) return undefined;
  return selection.id;
}

function isBusyError(body: unknown) {
  const text = JSON.stringify(body).toLowerCase();
  return text.includes("agent_busy") || text.includes("already has an active run");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type CursorDispatchResult = {
  ok: boolean;
  status: number;
  body: unknown;
  cursorTokenSlot: CursorTokenSlot;
};

async function dispatchAutomationWebhook(
  job: Job,
  token: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { cursorWebhookUrl } = getConfig();
  if (!cursorWebhookUrl) {
    throw new Error(
      "CURSOR_WEBHOOK_URL is required when CURSOR_USE_AUTOMATION_WEBHOOK=true",
    );
  }
  const payload = await buildCursorPayload(job);
  const response = await fetch(cursorWebhookUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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

async function dispatchCloudAgentCreate(
  job: Job,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const body = await buildCloudAgentBody(job);
  const created = await cursorPost("/v0/agents", body);
  if (created.ok) return created;

  const repository =
    process.env.CURSOR_AGENT_REPOSITORY?.trim() || DEFAULT_AGENT_REPO;
  const ref = process.env.CURSOR_AGENT_REF?.trim() || "main";
  const promptText = (body.prompt as { text: string }).text;
  const v1Body: Record<string, unknown> = {
    prompt: { text: promptText },
    repos: [{ url: repository, startingRef: ref }],
    autoCreatePR: false,
    skipReviewerRequest: true,
  };
  const v1Model = cloudAgentModelSelection();
  if (v1Model) v1Body.model = v1Model;
  const v1 = await cursorPost("/v1/agents", v1Body);
  return v1.ok ? v1 : created;
}

async function dispatchCloudAgentFollowUp(
  job: Job,
  existingId: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const body = await buildCloudAgentBody(job);
  const promptText = (body.prompt as { text: string }).text;
  const followup = () =>
    cursorPost(`/v0/agents/${existingId}/followup`, {
      prompt: { text: promptText },
    });
  // Stay within serverless maxDuration (~60s): cap total busy-wait time.
  const deadline = Date.now() + 45_000;
  let last = await followup();
  for (
    let attempt = 0;
    !last.ok &&
    isBusyError(last.body) &&
    attempt < 4 &&
    Date.now() < deadline;
    attempt++
  ) {
    console.info(
      `[relay] Standing agent ${existingId} busy; retry ${attempt + 1}`,
    );
    await sleep(2000);
    last = await followup();
  }
  if (last.ok) {
    return {
      ok: true,
      status: last.status,
      body: {
        id: existingId,
        ...(typeof last.body === "object" && last.body ? last.body : {}),
      },
    };
  }
  return last;
}

export async function dispatchToCursor(job: Job): Promise<CursorDispatchResult> {
  const slots = listCursorTokenSlots();
  if (!slots.length) {
    throw new Error(
      "Cursor API token is not configured (CURSOR_WEBHOOK_TOKEN or CURSOR_WEBHOOK_TOKEN_ALT)",
    );
  }

  // Follow-ups / standing agents are account-bound — no cross-account failover.
  // CURSOR_AGENT_ID only belongs to the primary API key account.
  const followUpId = job.followUpAgentId?.trim();
  const preferredSlot = job.cursorTokenSlot ?? "primary";
  const standingId =
    !followUpId && preferredSlot === "primary" ? standingAgentId() : undefined;
  const existingId = followUpId || standingId;
  if (existingId) {
    const candidate = orderCursorTokenSlots(preferredSlot)[0]!;
    const result = await withCursorToken(candidate.token, async () => {
      if (useAutomationWebhook()) {
        return dispatchAutomationWebhook(job, candidate.token);
      }
      return dispatchCloudAgentFollowUp(job, existingId);
    });
    return { ...result, cursorTokenSlot: candidate.slot };
  }

  const ordered = orderCursorTokenSlots(job.cursorTokenSlot);
  let last: CursorDispatchResult | undefined;
  for (const candidate of ordered) {
    const result = await withCursorToken(candidate.token, async () => {
      if (useAutomationWebhook()) {
        return dispatchAutomationWebhook(job, candidate.token);
      }
      return dispatchCloudAgentCreate(job);
    });
    last = { ...result, cursorTokenSlot: candidate.slot };
    if (result.ok) {
      if (candidate.slot !== "primary") {
        console.info(
          `[relay] Dispatched ${job.id} with CURSOR_WEBHOOK_TOKEN_ALT (${candidate.slot})`,
        );
      }
      return last;
    }
    if (
      ordered.length > 1 &&
      candidate !== ordered[ordered.length - 1] &&
      shouldFailoverCursorCreate(result.status, result.body)
    ) {
      console.warn(
        `[relay] Cursor ${candidate.slot} token failed HTTP ${result.status} for ${job.id}; trying alternate account`,
      );
      continue;
    }
    return last;
  }

  return (
    last ?? {
      ok: false,
      status: 0,
      body: "No Cursor API token configured",
      cursorTokenSlot: "primary",
    }
  );
}
