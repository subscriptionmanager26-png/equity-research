import { getConfig } from "@/lib/config";
import { handleTelegramMessage } from "@/lib/handle-telegram";
import { getStore, updateStore } from "@/lib/store";
import { deleteTelegramWebhook, getMe, getUpdates } from "@/lib/telegram";

declare global {
  var __relayTelegramPoller: { started: boolean } | undefined;
}

export async function startTelegramPoller() {
  if (globalThis.__relayTelegramPoller?.started) return;
  globalThis.__relayTelegramPoller = { started: true };

  const cfg = getConfig();
  if (!cfg.telegramConfigured) {
    console.info("[relay] Telegram polling skipped: TELEGRAM_BOT_TOKEN is not set");
    return;
  }

  try {
    const me = await getMe();
    console.info(
      `[relay] Telegram bot @${me.username ?? me.id} connected; starting long poll`,
    );
    await deleteTelegramWebhook().catch(() => undefined);
  } catch (error) {
    console.error("[relay] Telegram getMe failed", error);
    return;
  }

  void loop();
}

async function loop() {
  while (true) {
    try {
      const store = await getStore();
      const updates = await getUpdates(store.telegramOffset);
      for (const update of updates) {
        const message = update.message ?? update.channel_post;
        try {
          if (message) {
            await handleTelegramMessage(message);
          }
        } catch (error) {
          console.error("[relay] Telegram update handler failed", error);
        } finally {
          await updateStore((data) => {
            data.telegramOffset = update.update_id + 1;
          });
        }
      }
    } catch (error) {
      console.error("[relay] Telegram poll error", error);
      await sleep(3000);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
