import { getConfig } from "@/lib/config";
import { ingestAndDispatch } from "@/lib/relay";
import { rememberChat } from "@/lib/jobs";
import {
  displayName,
  sendTelegramMessage,
  type TelegramMessage,
} from "@/lib/telegram";

export async function handleTelegramMessage(message: TelegramMessage) {
  const text = message.text?.trim();
  const chatId = message.chat.id;
  const name = displayName(message.from, message.chat);

  await rememberChat({
    chatId,
    username: message.from?.username,
    displayName: name,
  });

  if (!text) {
    await sendTelegramMessage({
      chatId,
      text: "Send me a text message and I will hand it to your Cursor agent.",
      replyToMessageId: message.message_id,
    });
    return { ignored: true };
  }

  if (text === "/start" || text === "/help") {
    const { cursorConfigured } = getConfig();
    await sendTelegramMessage({
      chatId,
      text: [
        `Hi ${name}. I am Relay, and this chat is linked.`,
        "Send a task in plain text. I post it to your Cursor automation, and the agent replies here on Telegram.",
        cursorConfigured
          ? "Cursor webhook: configured."
          : "Cursor webhook: missing. Set CURSOR_WEBHOOK_URL and CURSOR_WEBHOOK_TOKEN.",
        "If Cursor says the automation is disabled, turn it on at cursor.com/automations, then send the task again.",
        "Commands: /start, /help",
      ].join("\n"),
    });
    return { command: text };
  }

  await sendTelegramMessage({
    chatId,
    text: "Sent to your Cursor agent. I will reply here when it posts back.",
    replyToMessageId: message.message_id,
  });

  try {
    const job = await ingestAndDispatch({
      source: "telegram",
      prompt: text,
      chatId,
      username: message.from?.username,
      displayName: name,
    });
    return { jobId: job.id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Dispatch failed";
    await sendTelegramMessage({
      chatId,
      text: `Something went wrong before I could reach Cursor: ${detail}`,
    }).catch(() => undefined);
    return { error: detail };
  }
}
