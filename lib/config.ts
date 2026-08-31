function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function getConfig() {
  const cursorWebhookUrl = trim(process.env.CURSOR_WEBHOOK_URL);
  const cursorWebhookToken = trim(process.env.CURSOR_WEBHOOK_TOKEN);
  const telegramBotToken = trim(process.env.TELEGRAM_BOT_TOKEN);
  const telegramChatId = trim(process.env.TELEGRAM_CHAT_ID);
  const telegramWebhookSecret = trim(process.env.TELEGRAM_WEBHOOK_SECRET);
  const replyWebhookSecret = trim(process.env.REPLY_WEBHOOK_SECRET);
  const publicUrl = trim(process.env.PUBLIC_URL).replace(/\/$/, "");
  const cursorStatusWebhookSecret = trim(
    process.env.CURSOR_STATUS_WEBHOOK_SECRET,
  );

  return {
    cursorWebhookUrl,
    cursorWebhookToken,
    telegramBotToken,
    telegramChatId,
    telegramWebhookSecret,
    replyWebhookSecret,
    publicUrl,
    cursorStatusWebhookSecret,
    cursorConfigured: Boolean(cursorWebhookUrl && cursorWebhookToken),
    telegramConfigured: Boolean(telegramBotToken),
    replyConfigured: Boolean(replyWebhookSecret),
  };
}

export function publicStatus() {
  const cfg = getConfig();
  return {
    cursorConfigured: cfg.cursorConfigured,
    telegramConfigured: cfg.telegramConfigured,
    replyConfigured: cfg.replyConfigured,
    publicUrlSet: Boolean(cfg.publicUrl),
    telegramChatIdSet: Boolean(cfg.telegramChatId),
    replyPath: "/api/reply",
    telegramWebhookPath: "/api/telegram/webhook",
    cursorStatusPath: "/api/cursor/status",
  };
}
