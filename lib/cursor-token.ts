import { AsyncLocalStorage } from "node:async_hooks";

import { getConfig } from "@/lib/config";

export type CursorTokenSlot = "primary" | "saffronai";

export type CursorTokenCandidate = {
  slot: CursorTokenSlot;
  token: string;
};

const activeToken = new AsyncLocalStorage<string>();

/** Active Bearer token for Cursor API calls in this async context. */
export function getActiveCursorToken(): string {
  return activeToken.getStore() ?? resolveCursorToken().token;
}

export async function withCursorToken<T>(
  token: string,
  fn: () => Promise<T>,
): Promise<T> {
  return activeToken.run(token, fn);
}

export async function withCursorTokenSlot<T>(
  slot: CursorTokenSlot | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const resolved = resolveCursorToken(slot);
  return withCursorToken(resolved.token, fn);
}

export function listCursorTokenSlots(): CursorTokenCandidate[] {
  const cfg = getConfig();
  const slots: CursorTokenCandidate[] = [];
  if (cfg.cursorWebhookToken) {
    slots.push({ slot: "primary", token: cfg.cursorWebhookToken });
  }
  if (cfg.cursorWebhookTokenSaffronai) {
    slots.push({ slot: "saffronai", token: cfg.cursorWebhookTokenSaffronai });
  }
  return slots;
}

/** Resolve a slot to a token. Defaults to primary, then alt. */
export function resolveCursorToken(
  slot?: CursorTokenSlot,
): CursorTokenCandidate {
  const slots = listCursorTokenSlots();
  if (!slots.length) {
    throw new Error("Cursor API token is not configured (CURSOR_WEBHOOK_TOKEN)");
  }
  if (slot) {
    const match = slots.find((entry) => entry.slot === slot);
    if (match) return match;
  }
  return slots[0]!;
}

/**
 * Order candidates for a new agent create.
 * Prefer an inherited slot (follow-up / prior job), then the rest for failover.
 */
export function orderCursorTokenSlots(
  preferred?: CursorTokenSlot,
): CursorTokenCandidate[] {
  const slots = listCursorTokenSlots();
  if (!preferred) return slots;
  const preferredEntry = slots.find((entry) => entry.slot === preferred);
  if (!preferredEntry) return slots;
  return [
    preferredEntry,
    ...slots.filter((entry) => entry.slot !== preferred),
  ];
}

/** Account/auth/quota failures where trying the alternate Cursor account helps. */
export function shouldFailoverCursorCreate(
  status: number,
  body: unknown,
): boolean {
  if ([401, 402, 403, 429].includes(status)) return true;
  const text = JSON.stringify(body ?? "").toLowerCase();
  return (
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("payment") ||
    text.includes("quota") ||
    text.includes("rate limit") ||
    text.includes("insufficient") ||
    text.includes("spend limit") ||
    text.includes("usage limit")
  );
}
