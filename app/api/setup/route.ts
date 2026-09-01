import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { ensureTelegramWebhook } from "@/lib/telegram-webhook-setup";

/** Register Telegram webhook after deploy (call once or from Vercel deploy hook). */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cfg = getConfig();
  if (!cfg.publicUrl) {
    return NextResponse.json(
      { error: "PUBLIC_URL is not set (on Vercel this is inferred from VERCEL_URL)" },
      { status: 400 },
    );
  }

  await ensureTelegramWebhook();
  return NextResponse.json({
    ok: true,
    telegramWebhook: `${cfg.publicUrl}/api/telegram/webhook`,
    cursorStatusWebhook: `${cfg.publicUrl}/api/cursor/status`,
  });
}

export async function GET() {
  const cfg = getConfig();
  return NextResponse.json({
    telegramWebhook: cfg.publicUrl
      ? `${cfg.publicUrl}/api/telegram/webhook`
      : null,
    cursorStatusWebhook: cfg.cursorStatusWebhookUrl ?? null,
    hint: "POST here after deploy to register the Telegram webhook",
  });
}
