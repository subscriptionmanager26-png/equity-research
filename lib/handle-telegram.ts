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
    const { publicUrl, cursorConfigured } = getConfig();
    await sendTelegramMessage({
      chatId,
      text: [
        `Hi ${name}. I am Relay.`,
        "Anything you type here is posted to your Cursor automation webhook.",
        "When the agent finishes, it posts back to Relay, and I send the answer here.",
        cursorConfigured
          ? "Cursor webhook: configured."
          : "Cursor webhook: missing. Set CURSOR_WEBHOOK_URL and CURSOR_WEBHOOK_TOKEN.",
        publicUrl
          ? `Reply webhook: ${publicUrl}/api/reply`
          : "Set PUBLIC_URL so the cloud agent can reach the reply webhook.",
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
