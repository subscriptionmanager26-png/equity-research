import { ingestAndDispatch } from "@/lib/relay";
import { getConfig } from "@/lib/config";
import {
  findSlackThreadJob,
  getJob,
  getSlackThread,
  listJobs,
  markSlackMessageProcessed,
  rememberSlackThread,
} from "@/lib/jobs";
import {
  attachmentsFromSlackEvent,
  enrichSlackThreadTs,
  fetchThreadContext,
  getSlackBotIdentity,
  isSlackBotMessage,
  messageTriggersRelay,
  ackSlackWorking,
  sendSlackMessage,
  shouldIgnoreSlackSubtype,
  stripSlackMentions,
} from "@/lib/slack";
import type { SlackInboundEvent } from "@/lib/types";

export const RELAY_SLACK_METADATA_TYPE = "relay_delivery";

export function isSlackThreadReply(event: {
  ts: string;
  thread_ts?: string;
}) {
  return Boolean(event.thread_ts && event.thread_ts !== event.ts);
}

export function isRelaySlackOutbound(event: {
  metadata?: { event_type?: string };
  bot_id?: string;
}) {
  if (event.metadata?.event_type === RELAY_SLACK_METADATA_TYPE) return true;
  if (event.bot_id) return true;
  return false;
}

export function classifySlackEvent(input: {
  type: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  channelId?: string;
  trackedThread: boolean;
  relayOutbound?: boolean;
}) {
  if (input.relayOutbound) return "ignore" as const;
  if (input.type !== "app_mention" && input.type !== "message") {
    return "ignore" as const;
  }
  const addressed =
    input.type === "app_mention" || messageTriggersRelay(input.text ?? "");
  const inDm = Boolean(input.channelId?.startsWith("D"));
  if (isSlackThreadReply(input) && input.trackedThread) {
    if (addressed) return "follow_up" as const;
    // DMs with you are a private thread; channels are shared — don't hijack chatter.
    if (inDm) return "follow_up" as const;
    return "ignore" as const;
  }
  if (addressed) return "mention" as const;
  return "ignore" as const;
}

async function resolveTrackedThread(channelId: string, threadTs: string) {
  const stored = await getSlackThread(channelId, threadTs);
  if (stored) return stored;
  const job = findSlackThreadJob(await listJobs(), channelId, threadTs);
  if (!job) return undefined;
  return {
    channelId,
    threadTs,
    lastJobId: job.id,
    updatedAt: job.updatedAt,
  };
}

export async function handleSlackEvent(event: SlackInboundEvent) {
  if (event.type !== "app_mention" && event.type !== "message") {
    return { ignored: true, reason: event.type };
  }
  if (isRelaySlackOutbound(event)) {
    return { ignored: true, reason: "relay_outbound" };
  }
  if (!(await markSlackMessageProcessed(`${event.channel}:${event.ts}`))) {
    return { ignored: true, reason: "duplicate_message" };
  }

  const enriched = await enrichSlackThreadTs(event);
  const threadTs = isSlackThreadReply(enriched) ? enriched.thread_ts : undefined;
  const tracked = threadTs
    ? await resolveTrackedThread(enriched.channel, threadTs)
    : undefined;
  const intent = classifySlackEvent({
    type: enriched.type,
    text: enriched.text,
    ts: enriched.ts,
    thread_ts: enriched.thread_ts,
    channelId: enriched.channel,
    trackedThread: Boolean(tracked),
    relayOutbound: false,
  });

  if (intent === "follow_up") {
    return handleThreadMessage(enriched);
  }
  if (intent === "mention") {
    return handleMention(enriched);
  }
  return { ignored: true, reason: "not_pocketedge" };
}

async function handleMention(event: SlackInboundEvent) {
  const bot = await getSlackBotIdentity();
  if (isSlackBotMessage(event, bot.userId)) {
    return { ignored: true, reason: "bot_message" };
  }

  const threadTs = event.thread_ts ?? event.ts;
  const text = stripSlackMentions(event.text ?? "");
  const files = attachmentsFromSlackEvent(event);
  if (files.length > 0 && !getConfig().publicUrl) {
    console.info(
      "[relay] Slack attachment will be inlined for Cursor (no PUBLIC_URL set)",
    );
  }
  const threadContext = await fetchThreadContext({
    channelId: event.channel,
    threadTs,
    excludeTs: event.ts,
  });

  if (!text && files.length === 0) {
    await sendSlackMessage({
      channelId: event.channel,
      threadTs,
      text: "Mention @pocketedge with a question, or attach a file in the same message.",
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

  await ackSlackWorking(event.channel, event.ts).catch((error) => {
    console.error("[relay] Slack working reaction failed", error);
  });

  const tracked = await resolveTrackedThread(event.channel, threadTs);
  const prior = tracked?.lastJobId ? await getJob(tracked.lastJobId) : undefined;

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
      followUpAgentId: prior?.cursorAgentId ?? prior?.followUpAgentId,
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

  const tracked = await resolveTrackedThread(event.channel, threadTs);
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

  await ackSlackWorking(event.channel, event.ts).catch((error) => {
    console.error("[relay] Slack working reaction failed", error);
  });

  try {
    const prior = tracked.lastJobId ? await getJob(tracked.lastJobId) : undefined;
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
      followUpAgentId: prior?.cursorAgentId ?? prior?.followUpAgentId,
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
