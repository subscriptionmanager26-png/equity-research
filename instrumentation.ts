export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const onVercel = Boolean(process.env.VERCEL);

  if (onVercel) {
    const { ensureTelegramWebhook } = await import("./lib/telegram-webhook-setup");
    await ensureTelegramWebhook().catch((error) => {
      console.error("[relay] Telegram webhook registration failed", error);
    });
    console.info("[relay] Vercel mode: Telegram webhook + Cursor status webhook (no local pollers)");
    return;
  }

  const { startTelegramPoller } = await import("./lib/telegram-poller");
  const { startSlackSocket } = await import("./lib/slack-socket");
  const { startSlackUserPoller } = await import("./lib/slack-user-poller");
  const { startCursorWaiter } = await import("./lib/cursor-wait");
  await startTelegramPoller();
  await startSlackSocket();
  await startSlackUserPoller();
  startCursorWaiter();
}
