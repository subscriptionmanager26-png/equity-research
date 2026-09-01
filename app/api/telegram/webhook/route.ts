import { NextResponse } from "next/server";

import { continueAfterResponse } from "@/lib/after-response";
import { getConfig } from "@/lib/config";
import { watchDispatchedJob } from "@/lib/cursor-wait";
import { handleTelegramMessage } from "@/lib/handle-telegram";
import { getJob } from "@/lib/jobs";
import { timingSafeEqual } from "@/lib/relay";
import { pollSlackOnce } from "@/lib/slack-user-poller";
import type { TelegramUpdate } from "@/lib/telegram";

export const maxDuration = 60;

export async function POST(request: Request) {
  const cfg = getConfig();
  if (!cfg.telegramConfigured) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN is not set" },
      { status: 503 },
    );
  }

  if (cfg.telegramWebhookSecret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!timingSafeEqual(header, cfg.telegramWebhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) {
    return NextResponse.json({ ok: true });
  }

  const message = update.message ?? update.edited_message;
  if (message) {
    const result = await handleTelegramMessage(message).catch((error) => {
      console.error("[relay] Telegram webhook handler failed", error);
      return undefined;
    });
    const jobId = result && "jobId" in result ? result.jobId : undefined;
    if (jobId) {
      const job = await getJob(jobId);
      const agentId = job?.cursorAgentId;
      if (job?.status === "dispatched" && agentId) {
        continueAfterResponse(() =>
          watchDispatchedJob(job.id, agentId, Date.parse(job.createdAt)),
        );
      }
    }
  }

  continueAfterResponse(async () => {
    await pollSlackOnce().catch((error) => {
      console.error("[relay] Slack user poll after Telegram failed", error);
    });
  });

  return NextResponse.json({ ok: true });
}
