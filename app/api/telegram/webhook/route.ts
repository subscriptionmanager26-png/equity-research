import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { handleTelegramMessage } from "@/lib/handle-telegram";
import { timingSafeEqual } from "@/lib/relay";
import type { TelegramUpdate } from "@/lib/telegram";

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
    await handleTelegramMessage(message).catch((error) => {
      console.error("[relay] Telegram webhook handler failed", error);
    });
  }

  return NextResponse.json({ ok: true });
}
