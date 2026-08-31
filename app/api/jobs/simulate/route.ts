import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { addJobEvent, latestChat, listJobs } from "@/lib/jobs";
import { deliverReply } from "@/lib/relay";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    job_id?: string;
    message?: string;
  } | null;

  const jobs = await listJobs();
  const job = body?.job_id
    ? jobs.find((item) => item.id === body.job_id)
    : jobs[0];
  if (!job) {
    return NextResponse.json({ error: "No job to reply to" }, { status: 404 });
  }

  const cfg = getConfig();
  const chat = await latestChat();
  const message =
    body?.message?.trim() ||
    `Simulated agent reply for ${job.id}.\n\nYou asked: ${job.prompt}`;

  try {
    const delivery = await deliverReply({
      job,
      chatId: job.chatId ?? chat?.chatId,
      status: "finished",
      message,
    });
    const updated = await addJobEvent(
      job.id,
      {
        type: "replied",
        detail: delivery.chatId
          ? `Simulated delivery to Telegram chat ${delivery.chatId}`
          : "Simulated reply stored (no Telegram chat yet)",
      },
      {
        status: "replied",
        reply: {
          message,
          status: "simulated",
          receivedAt: new Date().toISOString(),
          telegramMessageId: delivery.telegramMessageId,
        },
      },
    );
    return NextResponse.json({
      job: updated,
      deliveredToTelegram: Boolean(delivery.telegramMessageId),
      telegramConfigured: cfg.telegramConfigured,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Simulate failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
