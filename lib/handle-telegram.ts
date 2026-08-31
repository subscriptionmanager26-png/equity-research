import { getConfig } from "@/lib/config";
import { ingestAndDispatch } from "@/lib/relay";
import { logInbound, rememberChat } from "@/lib/jobs";
import {
  attachmentsFromMessage,
  displayName,
  sendTelegramMessage,
  type TelegramMessage,
} from "@/lib/telegram";

export async function handleTelegramMessage(message: TelegramMessage) {
  const text = (message.text ?? message.caption)?.trim();
  const files = attachmentsFromMessage(message);
  const chatId = message.chat.id;
  const name = displayName(message.from, message.chat);

  await rememberChat({
    chatId,
    username: message.from?.username,
    displayName: name,
  });

  if (!text && files.length === 0) {
    await logInbound({ chatId, kind: "non-text" });
    await sendTelegramMessage({
      chatId,
      text: "Send a text message, or a file with a caption, and I will hand it to your Cursor agent.",
      replyToMessageId: message.message_id,
    }).catch(() => undefined);
    return { ignored: true };
  }

  if (text === "/start" || text === "/help") {
    await logInbound({ chatId, text, kind: "command" });
    const { cursorConfigured } = getConfig();
    await sendTelegramMessage({
      chatId,
      text: [
        `Hi ${name}. I am Relay, and this chat is linked.`,
        "Send a task in plain text, or attach a file with a caption.",
        "I post it to your Cursor automation, and the agent replies here on Telegram.",
        cursorConfigured
          ? "Cursor webhook: configured."
          : "Cursor webhook: missing. Set CURSOR_WEBHOOK_URL and CURSOR_WEBHOOK_TOKEN.",
        "If Cursor says the automation is disabled, turn it on at cursor.com/automations, then send the task again.",
        "Commands: /start, /help",
      ].join("\n"),
    }).catch(() => undefined);
    return { command: text };
  }

  const prompt =
    text ||
    `Process the attached file${files.length === 1 ? "" : "s"} and follow any implied request.`;

  await logInbound({
    chatId,
    text: prompt,
    kind: files.length ? "task-with-file" : "task",
    files: files.map((file) => file.name),
  });

  await sendTelegramMessage({
    chatId,
    text: files.length
      ? `Sent to your Cursor agent with ${files.length} file${files.length === 1 ? "" : "s"}. I will reply here when it finishes.`
      : "Sent to your Cursor agent. I will reply here when it finishes.",
    replyToMessageId: message.message_id,
  }).catch((error) => {
    console.error("[relay] Telegram ack failed", error);
  });

  try {
    const job = await ingestAndDispatch({
      source: "telegram",
      prompt,
      chatId,
      username: message.from?.username,
      displayName: name,
      files,
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
