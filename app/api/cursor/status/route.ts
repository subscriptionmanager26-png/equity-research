import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { addJobEvent, listJobs } from "@/lib/jobs";
import { deliverReply, timingSafeEqual } from "@/lib/relay";

function verifySignature(secret: string, rawBody: string, signature: string) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(expected, signature);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const cfg = getConfig();

  if (cfg.cursorStatusWebhookSecret) {
    const signature = request.headers.get("x-webhook-signature") ?? "";
    if (!verifySignature(cfg.cursorStatusWebhookSecret, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: {
    event?: string;
    id?: string;
    status?: string;
    summary?: string;
    target?: { url?: string; prUrl?: string; branchName?: string };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobs = await listJobs();
  const pending = jobs.find(
    (job) => job.status === "dispatched" || job.status === "queued",
  );

  const summary =
    payload.summary?.trim() ||
    `Cursor agent ${payload.status ?? "updated"}${
      payload.id ? ` (${payload.id})` : ""
    }.`;
  const links = [
    payload.target?.url,
    payload.target?.prUrl,
    payload.target?.branchName
      ? `Branch: ${payload.target.branchName}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  const message = links ? `${summary}\n\n${links}` : summary;

  if (pending) {
    try {
      const delivery = await deliverReply({
        job: pending,
        status: payload.status === "ERROR" ? "error" : "finished",
        message,
      });
      await addJobEvent(
        pending.id,
        {
          type: "cursor_status",
          detail: `Cursor ${payload.status ?? "statusChange"} for ${payload.id ?? "agent"}`,
        },
        {
          status: payload.status === "ERROR" ? "error" : "replied",
          reply: {
            message,
            status: payload.status ?? "statusChange",
            receivedAt: new Date().toISOString(),
            telegramMessageId: delivery.telegramMessageId,
          },
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Delivery failed";
      await addJobEvent(pending.id, { type: "telegram_error", detail });
    }
  }

  return NextResponse.json({ ok: true });
}
