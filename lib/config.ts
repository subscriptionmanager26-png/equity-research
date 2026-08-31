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
  const slackBotToken = trim(process.env.SLACK_BOT_TOKEN);
  const slackUserToken = trim(process.env.SLACK_USER_TOKEN);
  const slackAppToken = trim(process.env.SLACK_APP_TOKEN);
  const slackSigningSecret = trim(process.env.SLACK_SIGNING_SECRET);
  const slackTriggerWord = trim(process.env.SLACK_TRIGGER_WORD) || "pocketedge";
  const slackMentionUserId = trim(process.env.SLACK_MENTION_USER_ID);
  const slackChannelIds = trim(process.env.SLACK_CHANNEL_IDS)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const slackApiToken = slackBotToken || slackUserToken;

  return {
    cursorWebhookUrl,
    cursorWebhookToken,
    telegramBotToken,
    telegramChatId,
    telegramWebhookSecret,
    replyWebhookSecret,
    publicUrl,
    cursorStatusWebhookSecret,
    slackBotToken,
    slackUserToken,
    slackAppToken,
    slackSigningSecret,
    slackTriggerWord,
    slackMentionUserId,
    slackChannelIds,
    slackApiToken,
    cursorConfigured: Boolean(cursorWebhookUrl && cursorWebhookToken),
    telegramConfigured: Boolean(telegramBotToken),
    slackConfigured: Boolean(slackApiToken),
    slackBotConfigured: Boolean(slackBotToken),
    slackUserConfigured: Boolean(slackUserToken),
    slackSocketConfigured: Boolean(slackBotToken && slackAppToken),
    slackUserPollConfigured: Boolean(
      slackUserToken && !(slackBotToken && slackAppToken),
    ),
    replyConfigured: Boolean(replyWebhookSecret),
  };
}

export function publicStatus() {
  const cfg = getConfig();
  return {
    cursorConfigured: cfg.cursorConfigured,
    telegramConfigured: cfg.telegramConfigured,
    slackConfigured: cfg.slackConfigured,
    slackBotConfigured: cfg.slackBotConfigured,
    slackUserConfigured: cfg.slackUserConfigured,
    slackSocketConfigured: cfg.slackSocketConfigured,
    slackUserPollConfigured: cfg.slackUserPollConfigured,
    slackTriggerWord: cfg.slackTriggerWord,
    replyConfigured: cfg.replyConfigured,
    publicUrlSet: Boolean(cfg.publicUrl),
    telegramChatIdSet: Boolean(cfg.telegramChatId),
    replyPath: "/api/reply",
    telegramWebhookPath: "/api/telegram/webhook",
    slackEventsPath: "/api/slack/events",
    cursorStatusPath: "/api/cursor/status",
  };
}
