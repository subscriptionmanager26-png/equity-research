export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startTelegramPoller } = await import("./lib/telegram-poller");
  const { startSlackSocket } = await import("./lib/slack-socket");
  const { startCursorWaiter } = await import("./lib/cursor-wait");
  await startTelegramPoller();
  await startSlackSocket();
  startCursorWaiter();
}
