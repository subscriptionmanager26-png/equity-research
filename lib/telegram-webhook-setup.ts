import { getConfig } from "@/lib/config";
import { setTelegramWebhook } from "@/lib/telegram";

/** Point Telegram at Relay's HTTPS webhook (used on Vercel instead of long-polling). */
export async function ensureTelegramWebhook() {
  const cfg = getConfig();
  if (!cfg.telegramConfigured || !cfg.publicUrl) {
    console.info("[relay] Telegram webhook setup skipped (token or PUBLIC_URL missing)");
    return;
  }

  const url = `${cfg.publicUrl}/api/telegram/webhook`;
  await setTelegramWebhook(url, cfg.telegramWebhookSecret || undefined);
  console.info(`[relay] Telegram webhook registered at ${url}`);
}
