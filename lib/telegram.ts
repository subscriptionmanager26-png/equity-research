import { getConfig } from "@/lib/config";
import { markdownToTelegramHtml } from "@/lib/chat-markup";
import { updateStore } from "@/lib/store";
import type { JobFile } from "@/lib/types";

const TELEGRAM_API = "https://api.telegram.org";

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramDocument = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramPhotoSize = {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramMessageEntity = {
  type: string;
  offset: number;
  length: number;
  user?: TelegramUser;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  reply_to_message?: TelegramMessage;
  document?: TelegramDocument;
  photo?: TelegramPhotoSize[];
  audio?: TelegramDocument & { title?: string };
  video?: TelegramDocument;
  voice?: { file_id: string; mime_type?: string; file_size?: number };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};

type TelegramApiResult<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

function botUrl(method: string) {
  const { telegramBotToken } = getConfig();
  if (!telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return `${TELEGRAM_API}/bot${telegramBotToken}/${method}`;
}

async function telegramCall<T>(
  method: string,
  body?: Record<string, unknown>,
): Promise<TelegramApiResult<T>> {
  const response = await fetch(botUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await response.json()) as TelegramApiResult<T>;
}

export function displayName(user?: TelegramUser, chat?: TelegramChat) {
  const parts = [user?.first_name, user?.last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return (
    user?.username ||
    chat?.title ||
    chat?.username ||
    (chat ? `chat ${chat.id}` : "Telegram")
  );
}

export async function getMe() {
  const result = await telegramCall<{
    id: number;
    username?: string;
    first_name?: string;
  }>("getMe");
  if (!result.ok || !result.result) {
    throw new Error(result.description ?? "Telegram getMe failed");
  }
  await updateStore((data) => {
    data.bot = {
      id: result.result!.id,
      username: result.result!.username,
      name: result.result!.first_name,
      checkedAt: new Date().toISOString(),
    };
  });
  return result.result;
}

export async function sendTelegramMessage(input: {
  chatId: number;
  text: string;
  replyToMessageId?: number;
}) {
  const chunks = splitTelegramText(input.text);
  let lastId: number | undefined;
  for (const chunk of chunks) {
    const html = markdownToTelegramHtml(chunk);
    const withHtml = await telegramCall<{ message_id: number }>(
      "sendMessage",
      {
        chat_id: input.chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_to_message_id: lastId ? undefined : input.replyToMessageId,
      },
    );
    const sent = withHtml.ok
      ? withHtml
      : await telegramCall<{ message_id: number }>("sendMessage", {
          chat_id: input.chatId,
          text: chunk,
          reply_to_message_id: lastId ? undefined : input.replyToMessageId,
        });
    if (!sent.ok) {
      throw new Error(sent.description ?? "Telegram sendMessage failed");
    }
    lastId = sent.result?.message_id;
  }
  return lastId;
}

export async function sendTelegramFile(input: {
  chatId: number;
  name: string;
  bytes: Uint8Array;
  mime?: string;
  caption?: string;
}) {
  const mime = input.mime ?? "application/octet-stream";
  const isImage = /^(image\/jpeg|image\/png|image\/gif|image\/webp)$/.test(mime);
  const method = isImage && input.bytes.byteLength <= 10 * 1024 * 1024 ? "sendPhoto" : "sendDocument";
  const field = method === "sendPhoto" ? "photo" : "document";
  const form = new FormData();
  form.set("chat_id", String(input.chatId));
  const copy = new Uint8Array(input.bytes.byteLength);
  copy.set(input.bytes);
  form.append(field, new Blob([copy], { type: mime }), input.name);
  if (input.caption) {
    form.set("caption", input.caption.slice(0, 1024));
  }
  const response = await fetch(botUrl(method), { method: "POST", body: form });
  const payload = (await response.json()) as TelegramApiResult<{ message_id: number }>;
  if (!payload.ok) {
    throw new Error(payload.description ?? `Telegram ${method} failed`);
  }
  return payload.result?.message_id;
}

export async function getUpdates(offset?: number) {
  const result = await telegramCall<TelegramUpdate[]>("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message", "channel_post"],
  });
  if (!result.ok) {
    throw new Error(result.description ?? "Telegram getUpdates failed");
  }
  return result.result ?? [];
}

export async function setTelegramWebhook(url: string, secret?: string) {
  return telegramCall("setWebhook", {
    url,
    secret_token: secret || undefined,
    allowed_updates: ["message", "channel_post"],
    drop_pending_updates: false,
  });
}

export async function deleteTelegramWebhook() {
  return telegramCall("deleteWebhook", { drop_pending_updates: false });
}

export async function getWebhookInfo() {
  return telegramCall<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  }>("getWebhookInfo");
}

export function attachmentsFromMessage(message: TelegramMessage): JobFile[] {
  const files: JobFile[] = [];
  if (message.document) {
    files.push({
      fileId: message.document.file_id,
      name: message.document.file_name ?? "document",
      mime: message.document.mime_type,
      size: message.document.file_size,
    });
  }
  if (message.photo?.length) {
    const largest = message.photo.reduce((best, item) =>
      item.width * item.height > best.width * best.height ? item : best,
    );
    files.push({
      fileId: largest.file_id,
      name: "photo.jpg",
      mime: "image/jpeg",
      size: largest.file_size,
    });
  }
  if (message.audio) {
    files.push({
      fileId: message.audio.file_id,
      name: message.audio.file_name ?? message.audio.title ?? "audio",
      mime: message.audio.mime_type,
      size: message.audio.file_size,
    });
  }
  if (message.video) {
    files.push({
      fileId: message.video.file_id,
      name: message.video.file_name ?? "video",
      mime: message.video.mime_type,
      size: message.video.file_size,
    });
  }
  if (message.voice) {
    files.push({
      fileId: message.voice.file_id,
      name: "voice.ogg",
      mime: message.voice.mime_type,
      size: message.voice.file_size,
    });
  }
  return files;
}

export function isPrivateChat(message: TelegramMessage) {
  return message.chat.type === "private";
}

export function isAddressedToBot(
  message: TelegramMessage,
  bot: { id?: number; username?: string },
) {
  if (isPrivateChat(message)) return true;
  const username = bot.username?.replace(/^@/, "").toLowerCase();
  const body = `${message.text ?? ""} ${message.caption ?? ""}`;
  if (username && new RegExp(`@${username}\\b`, "i").test(body)) return true;

  const source = message.text ?? message.caption ?? "";
  const entities = [
    ...(message.entities ?? []),
    ...(message.caption_entities ?? []),
  ];
  for (const entity of entities) {
    if (entity.type === "mention" && username) {
      const slice = source
        .slice(entity.offset, entity.offset + entity.length)
        .replace(/^@/, "")
        .toLowerCase();
      if (slice === username) return true;
    }
    if (entity.type === "text_mention" && bot.id && entity.user?.id === bot.id) {
      return true;
    }
    if (entity.type === "bot_command") return true;
  }

  const replyFrom = message.reply_to_message?.from;
  if (
    replyFrom?.is_bot &&
    ((bot.id && replyFrom.id === bot.id) ||
      (username && replyFrom.username?.toLowerCase() === username))
  ) {
    return true;
  }
  return false;
}

export function stripBotMention(text: string, username?: string) {
  if (!username) return text.trim();
  const handle = username.replace(/^@/, "");
  return text
    .replace(new RegExp(`^/([a-z0-9_]+)@${handle}\\b`, "i"), "/$1")
    .replace(new RegExp(`@${handle}\\b`, "gi"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function telegramFileUrl(fileId: string): Promise<string> {
  const result = await telegramCall<{ file_path: string }>("getFile", {
    file_id: fileId,
  });
  if (!result.ok || !result.result?.file_path) {
    throw new Error(result.description ?? "Telegram getFile failed");
  }
  const { telegramBotToken } = getConfig();
  return `${TELEGRAM_API}/file/bot${telegramBotToken}/${result.result.file_path}`;
}

function splitTelegramText(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
