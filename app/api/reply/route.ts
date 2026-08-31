import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { replyUrl } from "@/lib/cursor";
import { addJobEvent, getJob } from "@/lib/jobs";
import { bearerToken, deliverReply, timingSafeEqual } from "@/lib/relay";

export async function GET() {
  return NextResponse.json({
    endpoint: replyUrl(),
    method: "POST",
    auth: "Authorization: Bearer <REPLY_WEBHOOK_SECRET>",
    body: {
      job_id: "job_…",
      status: "finished",
      message: "Text delivered to Telegram",
    },
  });
}

export async function POST(request: Request) {
  const cfg = getConfig();
  if (!cfg.replyWebhookSecret) {
    return NextResponse.json(
      { error: "REPLY_WEBHOOK_SECRET is not set" },
      { status: 500 },
    );
  }

  const token =
    bearerToken(request.headers.get("authorization")) ??
    request.headers.get("x-relay-token") ??
    "";
  if (!timingSafeEqual(token, cfg.replyWebhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    job_id?: string;
    jobId?: string;
    chat_id?: number;
    chatId?: number;
    status?: string;
    message?: string;
    summary?: string;
    text?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const message = (body.message ?? body.summary ?? body.text ?? "").trim();
  if (!message) {
    return NextResponse.json(
      { error: "Body needs message, summary, or text" },
      { status: 400 },
    );
  }

  const jobId = body.job_id ?? body.jobId;
  const job = jobId ? await getJob(jobId) : undefined;
  const status = (body.status ?? "finished").toLowerCase();

  try {
    const delivery = await deliverReply({
      jobId,
      chatId: body.chat_id ?? body.chatId,
      status,
      message,
      job,
    });

    if (job) {
      await addJobEvent(
        job.id,
        {
          type: "replied",
          detail: delivery.chatId
            ? `Delivered to Telegram chat ${delivery.chatId}`
            : "Stored reply (no Telegram chat yet)",
        },
        {
          status: status === "error" ? "error" : "replied",
          error: status === "error" ? message : undefined,
          reply: {
            message,
            status,
            receivedAt: new Date().toISOString(),
            telegramMessageId: delivery.telegramMessageId,
          },
        },
      );
    }

    return NextResponse.json({
      ok: true,
      deliveredToTelegram: Boolean(delivery.telegramMessageId),
      chatId: delivery.chatId,
      jobId: job?.id ?? jobId ?? null,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Delivery failed";
    if (job) {
      await addJobEvent(
        job.id,
        { type: "telegram_error", detail },
        { error: detail },
      );
    }
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
