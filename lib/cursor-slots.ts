import { getRedis, kvEnabled } from "@/lib/store";

const SLOT_KEY = "relay:cursor:inflight";
const DEFAULT_MAX_INFLIGHT = 5;
const DEFAULT_RETRY_SECONDS = 15;

function maxInflight() {
  const raw = Number(process.env.CURSOR_MAX_INFLIGHT ?? DEFAULT_MAX_INFLIGHT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_INFLIGHT;
}

export async function acquireCursorSlot(): Promise<
  { ok: true } | { ok: false; retryAfterSeconds: number }
> {
  if (!kvEnabled()) return { ok: true };
  const redis = await getRedis();
  const current = Number((await redis.get<number | string>(SLOT_KEY)) ?? 0);
  if (current >= maxInflight()) {
    return { ok: false, retryAfterSeconds: DEFAULT_RETRY_SECONDS };
  }
  await redis.incr(SLOT_KEY);
  await redis.expire(SLOT_KEY, 120);
  return { ok: true };
}

export async function releaseCursorSlot() {
  if (!kvEnabled()) return;
  const redis = await getRedis();
  const next = await redis.decr(SLOT_KEY);
  if (next < 0) {
    await redis.set(SLOT_KEY, 0);
  }
}
