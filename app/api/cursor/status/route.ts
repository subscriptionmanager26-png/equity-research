import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import {
  findDispatchedJobForAgent,
  markWebhookSeen,
  settleAgentJob,
} from "@/lib/cursor-settle";
import { listJobs } from "@/lib/jobs";
import { timingSafeEqual } from "@/lib/relay";

function verifySignature(secret: string, rawBody: string, signature: string) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(expected, signature);
}

type StatusPayload = {
  event?: string;
  id?: string;
  status?: string;
  summary?: string;
  target?: { url?: string; prUrl?: string; branchName?: string };
};

const DONE_STATUSES = new Set(["FINISHED", "ERROR", "IDLE"]);

export async function GET() {
  const cfg = getConfig();
  const url = cfg.publicUrl ? `${cfg.publicUrl}${cfg.cursorStatusPath}` : null;
  return NextResponse.json({
    endpoint: url ?? "/api/cursor/status",
    method: "POST",
    event: "statusChange",
    note: "Configure in Cursor → Cloud Agents → Webhooks. Set PUBLIC_URL and CURSOR_STATUS_WEBHOOK_SECRET.",
    configured: Boolean(cfg.publicUrl && cfg.cursorStatusWebhookSecret),
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const cfg = getConfig();
  const webhookId = request.headers.get("x-webhook-id") ?? "";
  const webhookEvent = request.headers.get("x-webhook-event") ?? "statusChange";

  if (cfg.cursorStatusWebhookSecret) {
    const signature = request.headers.get("x-webhook-signature") ?? "";
    if (!verifySignature(cfg.cursorStatusWebhookSecret, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: StatusPayload;
  try {
    payload = JSON.parse(rawBody) as StatusPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (webhookId && !markWebhookSeen(webhookId)) {
    return NextResponse.json({ ok: true, duplicate: true, webhookId });
  }

  const agentId = payload.id?.trim();
  const status = (payload.status ?? "").toUpperCase();

  if (!agentId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no_agent_id" });
  }

  if (!DONE_STATUSES.has(status)) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      agentId,
      status,
      event: webhookEvent,
    });
  }

  const jobs = await listJobs();
  const job = findDispatchedJobForAgent(jobs, agentId);
  if (!job) {
    console.info(
      `[relay] Status webhook for ${agentId} (${status}) — no dispatched job matched`,
    );
    return NextResponse.json({ ok: true, matched: false, agentId, status });
  }

  console.info(
    `[relay] Status webhook ${webhookEvent} ${status} for ${agentId} → ${job.id}`,
  );

  void settleAgentJob(job.id, agentId, { trigger: "webhook" }).then((result) => {
    if (
      !result.ok &&
      result.reason !== "already_replied" &&
      result.reason !== "already_settling"
    ) {
      console.warn(`[relay] Webhook settle failed for ${job.id}`, result);
    }
  });

  return NextResponse.json({
    ok: true,
    matched: true,
    jobId: job.id,
    agentId,
    status,
    webhookId: webhookId || undefined,
  });
}
