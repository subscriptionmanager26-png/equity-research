import { getConfig } from "@/lib/config";
import { ingestAndDispatch } from "@/lib/relay";
import { findTelegramFollowUpJob, listJobs, logInbound, rememberChat } from "@/lib/jobs";
import { getStore } from "@/lib/store";
import {
  attachmentsFromMessage,
  displayName,
  getMe,
  isAddressedToBot,
  isPrivateChat,
  sendTelegramMessage,
  stripBotMention,
  type TelegramMessage,
} from "@/lib/telegram";

async function botIdentity() {
  const stored = (await getStore()).bot;
  if (stored?.username || stored?.id) return stored;
  return getMe();
}

export async function handleTelegramMessage(message: TelegramMessage) {
  const bot = await botIdentity();
  const rawText = (message.text ?? message.caption)?.trim();
  const text = stripBotMention(rawText ?? "", bot.username);
  const files = attachmentsFromMessage(message);
  const chatId = message.chat.id;
  const name = displayName(message.from, message.chat);
  const privateChat = isPrivateChat(message);

  if (!privateChat && !isAddressedToBot(message, bot)) {
    return { ignored: true };
  }

  await rememberChat({
    chatId,
    username: message.chat.username ?? message.from?.username,
    displayName: message.chat.title ?? name,
  });

  if (!text && files.length === 0) {
    await logInbound({ chatId, kind: "non-text" });
    await sendTelegramMessage({
      chatId,
      text: privateChat
        ? "Send a text message, or a file with a caption, and I will hand it to your Cursor agent."
        : "Tag me with a task, or attach a file and mention me in the caption.",
      replyToMessageId: message.message_id,
    }).catch(() => undefined);
    return { ignored: true };
  }

  if (text === "/status") {
    await logInbound({ chatId, text, kind: "command" });
    const jobs = (await listJobs())
      .filter((job) => job.chatId === chatId)
      .slice(0, 5);
    if (jobs.length === 0) {
      await sendTelegramMessage({
        chatId,
        text: "No tasks yet in this chat. Send a question and I will start a Cursor agent.",
        replyToMessageId: message.message_id,
      }).catch(() => undefined);
      return { command: text };
    }
    const lines = jobs.map((job) => {
      const title = (job.prompt || "task").replace(/\s+/g, " ").slice(0, 60);
      const files = job.reply?.files?.length
        ? ` · files ${job.reply.files.join(", ")}`
        : job.pendingArtifacts
          ? " · waiting for report file"
          : "";
      return `• ${job.status} — ${title}${files}`;
    });
    await sendTelegramMessage({
      chatId,
      text: `Latest tasks:\n${lines.join("\n")}\n\nWatch runs on the Relay dashboard (not in this chat).`,
      replyToMessageId: message.message_id,
    }).catch(() => undefined);
    return { command: text };
  }

  if (text === "/start" || text === "/help") {
    await logInbound({ chatId, text, kind: "command" });
    const { cursorConfigured } = getConfig();
    const handle = bot.username ? `@${bot.username}` : "me";
    await sendTelegramMessage({
      chatId,
      text: [
        `Hi ${name}. I am Relay.`,
        privateChat
          ? "Send a task in plain text, or attach a file with a caption."
          : `In this channel, tag ${handle} with the task. I only run when mentioned.`,
        "I post it to a Cursor cloud agent in this repo, and the agent replies here.",
        "Reply to my answer (Telegram Reply) to continue the same agent. A new message starts a new run.",
        "Watch live status on the Relay dashboard. I will not send Cursor links here.",
        cursorConfigured
          ? "Cursor cloud agent API: configured."
          : "Cursor API: missing. Set CURSOR_WEBHOOK_TOKEN.",
        "Commands: /start, /help, /status",
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

  const parent = message.reply_to_message
    ? findTelegramFollowUpJob(
        await listJobs(),
        chatId,
        message.reply_to_message.message_id,
      )
    : undefined;
  const followUpAgentId = parent?.cursorAgentId ?? parent?.followUpAgentId;

  const ackId = await sendTelegramMessage({
    chatId,
    text: files.length
      ? `Sent to Cursor with ${files.length} file${files.length === 1 ? "" : "s"}. I will reply here when it finishes.`
      : followUpAgentId
        ? "Sending this follow-up to the same Cursor agent."
        : "Sent to Cursor. I will reply here when it finishes.",
    replyToMessageId: message.message_id,
  }).catch((error) => {
    console.error("[relay] Telegram ack failed", error);
    return undefined;
  });

  try {
    const job = await ingestAndDispatch({
      source: "telegram",
      prompt,
      chatId,
      username: message.from?.username ?? message.chat.username,
      displayName: name,
      files,
      followUpAgentId,
      telegramInboundMessageId: message.message_id,
      telegramAckMessageId: ackId,
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
