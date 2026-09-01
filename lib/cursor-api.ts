import { getConfig } from "@/lib/config";

const API = "https://api.cursor.com";
export const MAX_ARTIFACT_BYTES = 45 * 1024 * 1024;
export const MAX_ARTIFACTS = 8;

function apiToken() {
  return getConfig().cursorWebhookToken;
}

async function cursorGet<T>(path: string): Promise<T> {
  const token = apiToken();
  if (!token) throw new Error("Cursor API token is not configured");
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Cursor API ${path} HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export function extractAgentId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  for (const key of ["backgroundComposerId", "id", "agentId", "bcId"]) {
    const value = record[key];
    if (typeof value === "string" && value.startsWith("bc-")) return value;
  }
  return undefined;
}

export type CursorAgentStatus = {
  id: string;
  status?: string;
  name?: string;
  url?: string;
  target?: { url?: string };
};

export async function getAgent(agentId: string) {
  return cursorGet<CursorAgentStatus>(`/v0/agents/${agentId}`);
}

export type CursorArtifact = {
  path: string;
  sizeBytes?: number;
};

export type CursorArtifactV0 = {
  absolutePath: string;
  sizeBytes?: number;
};

export async function listArtifacts(agentId: string): Promise<CursorArtifact[]> {
  const data = await cursorGet<{ items?: CursorArtifact[] }>(
    `/v1/agents/${agentId}/artifacts`,
  );
  return (data.items ?? []).filter((item) => item.path);
}

export async function listArtifactsV0(agentId: string): Promise<CursorArtifactV0[]> {
  const data = await cursorGet<{ artifacts?: CursorArtifactV0[] }>(
    `/v0/agents/${agentId}/artifacts`,
  );
  return (data.artifacts ?? []).filter((item) => item.absolutePath);
}

export async function downloadArtifact(
  agentId: string,
  path: string,
): Promise<{ name: string; bytes: Uint8Array; mime: string }> {
  const normalized = path.startsWith("artifacts/") ? path : `artifacts/${path}`;
  const encoded = encodeURIComponent(normalized);
  const data = await cursorGet<{ url?: string }>(
    `/v1/agents/${agentId}/artifacts/download?path=${encoded}`,
  );
  if (!data.url) {
    throw new Error(`No download URL for ${normalized}`);
  }
  const response = await fetch(data.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Artifact download HTTP ${response.status} for ${normalized}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const name = normalized.split("/").filter(Boolean).pop() ?? "artifact";
  return { name, bytes, mime: mimeFromName(name) };
}

export async function downloadArtifactV0(
  agentId: string,
  absolutePath: string,
): Promise<{ name: string; bytes: Uint8Array; mime: string }> {
  const encoded = encodeURIComponent(absolutePath);
  const data = await cursorGet<{ url?: string }>(
    `/v0/agents/${agentId}/artifacts/download?path=${encoded}`,
  );
  if (!data.url) {
    throw new Error(`No download URL for ${absolutePath}`);
  }
  const response = await fetch(data.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Artifact v0 download HTTP ${response.status} for ${absolutePath}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const name = absolutePath.split("/").filter(Boolean).pop() ?? "artifact";
  return { name, bytes, mime: mimeFromName(name) };
}

export async function collectAgentFiles(agentId: string) {
  const { collectAgentFilesWithRetry } = await import("@/lib/artifact-collect");
  return collectAgentFilesWithRetry(agentId);
}

export function mimeFromName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "md":
      return "text/markdown";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "html":
      return "text/html";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

export type ConversationMessage = {
  id?: string;
  type?: string;
  text?: string;
};

export async function getAgentConversation(agentId: string) {
  return cursorGet<{ messages?: ConversationMessage[] }>(
    `/v0/agents/${agentId}/conversation?full=true`,
  );
}

export function getConversationText(messages: ConversationMessage[]) {
  return messages.map((message) => message.text ?? "").join("\n");
}

/** Final assistant message — Relay passes this through unchanged. */
export function getFinalAssistantAnswer(messages: ConversationMessage[]) {
  const assistant = messages
    .filter((message) => message.type === "assistant_message" && message.text?.trim())
    .map((message) => cleanAgentAnswer(message.text ?? ""))
    .filter((text) => text.length > 0);
  return assistant[assistant.length - 1];
}

export async function getAgentAnswer(agentId: string): Promise<string | undefined> {
  return getAgentDeliveryAnswer(agentId);
}

export async function getAgentDeliveryAnswer(
  agentId: string,
): Promise<string | undefined> {
  const data = await getAgentConversation(agentId);
  return getFinalAssistantAnswer(data.messages ?? []);
}

export function cleanAgentAnswer(text: string) {
  const sections = text.split(/\n-{3,}\n/);
  const kept = sections.filter((section) => !isDeliveryNote(section));
  let cleaned = (kept.length ? kept : sections).join("\n\n").trim();
  cleaned = cleaned.replace(
    /(?:\n+)?(?:\*\*)?(?:Delivery(?: to Telegram)?(?: note)?|I did not post to Telegram|Could not POST this back)[\s\S]*$/i,
    "",
  );
  cleaned = cleaned.replace(
    /\s*Delivery to Telegram could not be completed:[\s\S]*?(?=\n\n|\n---|$)/gi,
    "",
  );
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function isDeliveryNote(section: string) {
  const value = section.toLowerCase();
  return (
    value.includes("reply_url") ||
    value.includes("reply_token") ||
    value.includes("did not post to telegram") ||
    value.includes("could not post this back") ||
    value.includes("delivery to telegram") ||
    value.includes("bot api instead") ||
    value.includes("configured relay destination")
  );
}

export function agentIsDone(status?: string) {
  const value = (status ?? "").toUpperCase();
  return ["FINISHED", "ERROR", "EXPIRED", "ARCHIVED", "IDLE"].includes(value);
}

export function agentFailed(status?: string) {
  const value = (status ?? "").toUpperCase();
  return ["ERROR", "EXPIRED"].includes(value);
}
