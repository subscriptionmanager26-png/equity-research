import { getConfig } from "@/lib/config";

const API = "https://api.cursor.com";

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

type ConversationMessage = {
  id?: string;
  type?: string;
  text?: string;
};

export async function getAgentAnswer(agentId: string): Promise<string | undefined> {
  const data = await cursorGet<{ messages?: ConversationMessage[] }>(
    `/v0/agents/${agentId}/conversation`,
  );
  const assistant = (data.messages ?? []).filter(
    (message) => message.type === "assistant_message" && message.text?.trim(),
  );
  if (!assistant.length) return undefined;
  const last = assistant[assistant.length - 1]?.text?.trim() ?? "";
  const cleaned = cleanAgentAnswer(last);
  if (cleaned.length >= 40) return cleaned;
  const combined = assistant
    .map((message) => cleanAgentAnswer(message.text ?? ""))
    .filter((text) => text.length > 20)
    .join("\n\n");
  return combined || cleaned || undefined;
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
