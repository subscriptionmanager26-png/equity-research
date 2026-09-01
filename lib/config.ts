import { storeBackend } from "@/lib/store";

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

function resolvePublicUrl() {
  const explicit = trim(process.env.PUBLIC_URL).replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel =
    trim(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    trim(process.env.VERCEL_URL);
  if (!vercel) return "";
  return vercel.startsWith("http") ? vercel.replace(/\/$/, "") : `https://${vercel}`;
}

export function getConfig() {
  const cursorWebhookUrl = trim(process.env.CURSOR_WEBHOOK_URL);
  const cursorWebhookToken = trim(process.env.CURSOR_WEBHOOK_TOKEN);
  const telegramBotToken = trim(process.env.TELEGRAM_BOT_TOKEN);
  const telegramChatId = trim(process.env.TELEGRAM_CHAT_ID);
  const telegramWebhookSecret = trim(process.env.TELEGRAM_WEBHOOK_SECRET);
  const replyWebhookSecret = trim(process.env.REPLY_WEBHOOK_SECRET);
  const publicUrl = resolvePublicUrl();
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

  const slackApiToken = slackUserToken || slackBotToken;

  return {
    cursorWebhookUrl,
    cursorWebhookToken,
    telegramBotToken,
    telegramChatId,
    telegramWebhookSecret,
    replyWebhookSecret,
    publicUrl,
    cursorStatusWebhookSecret,
    cursorStatusPath: "/api/cursor/status",
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
    slackUserPollConfigured: Boolean(slackUserToken),
    slackReplyAsUser: Boolean(slackUserToken),
    slackSocketConfigured: Boolean(
      slackBotToken && slackAppToken && !slackUserToken,
    ),
    replyConfigured: Boolean(replyWebhookSecret),
    cursorStatusConfigured: Boolean(publicUrl && cursorStatusWebhookSecret),
    cursorStatusWebhookUrl: publicUrl
      ? `${publicUrl}/api/cursor/status`
      : undefined,
    vercel: Boolean(process.env.VERCEL),
    storeBackend: storeBackend(),
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
    slackReplyAsUser: cfg.slackReplyAsUser,
    slackTriggerWord: cfg.slackTriggerWord,
    replyConfigured: cfg.replyConfigured,
    publicUrlSet: Boolean(cfg.publicUrl),
    telegramChatIdSet: Boolean(cfg.telegramChatId),
    replyPath: "/api/reply",
    telegramWebhookPath: "/api/telegram/webhook",
    slackEventsPath: "/api/slack/events",
    cursorStatusPath: cfg.cursorStatusPath,
    cursorStatusWebhookUrl: cfg.cursorStatusWebhookUrl,
    cursorStatusConfigured: cfg.cursorStatusConfigured,
    vercel: cfg.vercel,
    storeBackend: cfg.storeBackend,
  };
}
