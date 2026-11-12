import { getConfig } from "@/lib/config";

/**
 * Backup settle delays (seconds) before each attempt after dispatch.
 * Primary settle path is the Cursor status webhook — this chain only fires
 * if the webhook is missed. Sparse exponential backoff covers quick agents
 * and long equity-research runs without scanning Redis/Cursor on a fixed tick.
 */
export const SETTLE_BACKOFF_SECONDS = [60, 120, 300, 600, 1200] as const;
export const SETTLE_POLL_MAX_ATTEMPTS = SETTLE_BACKOFF_SECONDS.length;

/** After ack delivery, watch for Listening / timed-remind wakes on the same agent. */
export const LATE_WATCH_BACKOFF_SECONDS = [300, 600, 1200, 2400, 3600] as const;
export const LATE_WATCH_MAX_ATTEMPTS = LATE_WATCH_BACKOFF_SECONDS.length;

export function settleDelayForAttempt(attempt: number): number {
  if (attempt < 1) return SETTLE_BACKOFF_SECONDS[0];
  if (attempt > SETTLE_POLL_MAX_ATTEMPTS) {
    return SETTLE_BACKOFF_SECONDS[SETTLE_POLL_MAX_ATTEMPTS - 1];
  }
  return SETTLE_BACKOFF_SECONDS[attempt - 1];
}

export function lateWatchDelayForAttempt(attempt: number): number {
  if (attempt < 1) return LATE_WATCH_BACKOFF_SECONDS[0];
  if (attempt > LATE_WATCH_MAX_ATTEMPTS) {
    return LATE_WATCH_BACKOFF_SECONDS[LATE_WATCH_MAX_ATTEMPTS - 1];
  }
  return LATE_WATCH_BACKOFF_SECONDS[attempt - 1];
}

export function qstashToken() {
  return process.env.QSTASH_TOKEN?.trim() || "";
}

export function qstashConfigured() {
  return Boolean(qstashToken());
}

export function qstashDispatchUrl() {
  const { publicUrl } = getConfig();
  if (!publicUrl) {
    throw new Error("PUBLIC_URL is required to enqueue job dispatch");
  }
  return `${publicUrl}/api/jobs/dispatch`;
}

export function qstashSettleUrl() {
  const { publicUrl } = getConfig();
  if (!publicUrl) {
    throw new Error("PUBLIC_URL is required to enqueue job settle");
  }
  return `${publicUrl}/api/jobs/settle`;
}

export function qstashLateWatchUrl() {
  const { publicUrl } = getConfig();
  if (!publicUrl) {
    throw new Error("PUBLIC_URL is required to enqueue late watch");
  }
  return `${publicUrl}/api/jobs/late-watch`;
}

function cronHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET?.trim();
  const headers: Record<string, string> = {};
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

export async function enqueueJobDispatch(
  jobId: string,
  options?: { delaySeconds?: number },
) {
  const token = qstashToken();
  if (!token) {
    throw new Error("QSTASH_TOKEN is not configured");
  }
  const { Client } = await import("@upstash/qstash");
  const client = new Client({ token });
  const body: Record<string, unknown> = {
    url: qstashDispatchUrl(),
    body: { jobId },
    headers: cronHeaders(),
    retries: 3,
    deduplicationId: `dispatch-${jobId}`,
  };
  if (options?.delaySeconds && options.delaySeconds > 0) {
    body.delay = options.delaySeconds;
  }
  return client.publishJSON(body);
}

/**
 * Schedule a single-job settle check. Call after dispatch with attempt=1;
 * the settle route re-enqueues with backoff until the agent answers or the
 * schedule is exhausted.
 */
export async function enqueueJobSettle(
  jobId: string,
  attempt: number,
  options?: { delaySeconds?: number },
) {
  const token = qstashToken();
  if (!token) {
    throw new Error("QSTASH_TOKEN is not configured");
  }
  if (attempt < 1 || attempt > SETTLE_POLL_MAX_ATTEMPTS) {
    throw new Error(`settle attempt out of range: ${attempt}`);
  }
  const { Client } = await import("@upstash/qstash");
  const client = new Client({ token });
  const delay = options?.delaySeconds ?? settleDelayForAttempt(attempt);
  return client.publishJSON({
    url: qstashSettleUrl(),
    body: { jobId, attempt },
    headers: cronHeaders(),
    retries: 2,
    deduplicationId: `settle-${jobId}-${attempt}`,
    delay,
  });
}

/**
 * Sparse checks after a job is already replied — catches Cursor Listening
 * reminder wakes if the status webhook is missed.
 */
export async function enqueueJobLateWatch(
  jobId: string,
  attempt: number,
  options?: { delaySeconds?: number },
) {
  const token = qstashToken();
  if (!token) {
    throw new Error("QSTASH_TOKEN is not configured");
  }
  if (attempt < 1 || attempt > LATE_WATCH_MAX_ATTEMPTS) {
    throw new Error(`late-watch attempt out of range: ${attempt}`);
  }
  const { Client } = await import("@upstash/qstash");
  const client = new Client({ token });
  const delay = options?.delaySeconds ?? lateWatchDelayForAttempt(attempt);
  return client.publishJSON({
    url: qstashLateWatchUrl(),
    body: { jobId, attempt },
    headers: cronHeaders(),
    retries: 2,
    deduplicationId: `late-watch-${jobId}-${attempt}`,
    delay,
  });
}

export async function verifyQStashRequest(request: Request, rawBody: string) {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const next = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();
  if (!current) {
    // Local/dev without signing keys: allow CRON_SECRET bearer instead.
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return false;
    const header = request.headers.get("authorization") ?? "";
    return header === `Bearer ${secret}`;
  }
  const signature = request.headers.get("upstash-signature") ?? "";
  const { Receiver } = await import("@upstash/qstash");
  const receiver = new Receiver({
    currentSigningKey: current,
    nextSigningKey: next || current,
  });
  return receiver.verify({ signature, body: rawBody });
}
