import { getConfig } from "@/lib/config";

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
    deduplicationId: `dispatch:${jobId}`,
  };
  if (options?.delaySeconds && options.delaySeconds > 0) {
    body.delay = options.delaySeconds;
  }
  return client.publishJSON(body);
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
