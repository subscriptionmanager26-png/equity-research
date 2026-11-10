/** In-process Redis outage / quota failover (Blob becomes primary until expiry). */

const DEFAULT_FAILOVER_MS = 15 * 60 * 1000;
/** Monthly command caps do not recover mid-month — stay on Blob for a day. */
const QUOTA_FAILOVER_MS = 24 * 60 * 60 * 1000;

let failoverUntil = 0;

export function isRedisFailoverActive() {
  return Date.now() < failoverUntil;
}

export function redisFailoverUntil() {
  return failoverUntil > Date.now() ? failoverUntil : 0;
}

export function clearRedisFailover() {
  failoverUntil = 0;
}

export function isRedisUnavailableError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /max requests limit|ERR max requests|TOO_MANY_REQUESTS|rate limit|429|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up|network/i.test(
    msg,
  );
}

export function isRedisQuotaError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /max requests limit|ERR max requests|TOO_MANY_REQUESTS/i.test(msg);
}

export function markRedisFailover(
  reason: string,
  ms: number = DEFAULT_FAILOVER_MS,
) {
  const next = Date.now() + ms;
  if (next <= failoverUntil) return;
  failoverUntil = next;
  console.error(
    `[relay] Redis failover active until ${new Date(failoverUntil).toISOString()}: ${reason}`,
  );
}

/** Returns true when the error triggered failover. */
export function noteRedisError(error: unknown): boolean {
  if (!isRedisUnavailableError(error)) return false;
  const reason = error instanceof Error ? error.message : String(error);
  const ms = isRedisQuotaError(error) ? QUOTA_FAILOVER_MS : DEFAULT_FAILOVER_MS;
  markRedisFailover(reason.slice(0, 200), ms);
  return true;
}
