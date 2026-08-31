import { ingestAndDispatch } from "@/lib/relay";
import { getSlackThread, rememberSlackThread } from "@/lib/jobs";
import {
  attachmentsFromSlackEvent,
  fetchThreadContext,
  getSlackBotIdentity,
  isSlackBotMessage,
  sendSlackMessage,
  shouldIgnoreSlackSubtype,
  stripSlackMentions,
} from "@/lib/slack";
import type { SlackInboundEvent } from "@/lib/types";

export async function handleSlackEvent(event: SlackInboundEvent) {
  if (event.type === "app_mention") {
    return handleMention(event);
  }
  if (event.type === "message") {
    return handleThreadMessage(event);
  }
  return { ignored: true, reason: event.type };
}

async function handleMention(event: SlackInboundEvent) {
  const bot = await getSlackBotIdentity();
  if (isSlackBotMessage(event, bot.userId)) {
    return { ignored: true, reason: "bot_message" };
  }

  const threadTs = event.thread_ts ?? event.ts;
  const text = stripSlackMentions(event.text ?? "");
  const files = attachmentsFromSlackEvent(event);
  const threadContext = await fetchThreadContext({
    channelId: event.channel,
    threadTs,
    excludeTs: event.ts,
  });

  if (!text && files.length === 0) {
    await sendSlackMessage({
      channelId: event.channel,
      threadTs,
      text: "Mention me with a question, or attach a file in the same message.",
    }).catch(() => undefined);
    return { ignored: true, reason: "empty" };
  }

  const prompt =
    text ||
    `Process the attached file${files.length === 1 ? "" : "s"} and follow any implied request.`;

  await rememberSlackThread({
    channelId: event.channel,
    threadTs,
  });

  await sendSlackMessage({
    channelId: event.channel,
    threadTs,
    text:
      files.length > 0
        ? `Sent to Cursor with ${files.length} file${files.length === 1 ? "" : "s"}. I will reply in this thread when it finishes.`
        : "Sent to Cursor. I will reply in this thread when it finishes.",
  }).catch((error) => {
    console.error("[relay] Slack ack failed", error);
  });

  try {
    const job = await ingestAndDispatch({
      source: "slack",
      prompt,
      threadContext,
      displayName: event.user ? `Slack user ${event.user}` : "Slack user",
      username: event.user,
      slackChannelId: event.channel,
      slackThreadTs: threadTs,
      slackUserId: event.user,
      slackMessageTs: event.ts,
      files,
    });
    return { jobId: job.id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Dispatch failed";
    await sendSlackMessage({
      channelId: event.channel,
      threadTs,
      text: `Something went wrong before I could reach Cursor: ${detail}`,
    }).catch(() => undefined);
    return { error: detail };
  }
}

async function handleThreadMessage(event: SlackInboundEvent) {
  if (shouldIgnoreSlackSubtype(event.subtype)) {
    return { ignored: true, reason: event.subtype ?? "subtype" };
  }

  const bot = await getSlackBotIdentity();
  if (isSlackBotMessage(event, bot.userId)) {
    return { ignored: true, reason: "bot_message" };
  }

  const threadTs = event.thread_ts;
  if (!threadTs || threadTs === event.ts) {
    return { ignored: true, reason: "not_thread_reply" };
  }

  const tracked = await getSlackThread(event.channel, threadTs);
  if (!tracked) {
    return { ignored: true, reason: "untracked_thread" };
  }

  const text = stripSlackMentions(event.text ?? "").trim();
  const files = attachmentsFromSlackEvent(event);
  if (!text && files.length === 0) {
    return { ignored: true, reason: "empty" };
  }

  const threadContext = await fetchThreadContext({
    channelId: event.channel,
    threadTs,
    excludeTs: event.ts,
  });

  const prompt =
    text ||
    `Process the attached file${files.length === 1 ? "" : "s"} and follow any implied request.`;

  await sendSlackMessage({
    channelId: event.channel,
    threadTs,
    text: "Got it — sending this follow-up to Cursor.",
  }).catch(() => undefined);

  try {
    const job = await ingestAndDispatch({
      source: "slack",
      prompt,
      threadContext,
      displayName: event.user ? `Slack user ${event.user}` : "Slack user",
      username: event.user,
      slackChannelId: event.channel,
      slackThreadTs: threadTs,
      slackUserId: event.user,
      slackMessageTs: event.ts,
      files,
    });
    return { jobId: job.id, followUp: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Dispatch failed";
    await sendSlackMessage({
      channelId: event.channel,
      threadTs,
      text: `Something went wrong before I could reach Cursor: ${detail}`,
    }).catch(() => undefined);
    return { error: detail };
  }
}
