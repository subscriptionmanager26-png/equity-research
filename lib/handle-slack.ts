import { ingestAndDispatch } from "@/lib/relay";
import { getConfig } from "@/lib/config";
import {
  findSlackThreadJob,
  findJobForSlackInbound,
  getJob,
  getSlackThread,
  listJobs,
  markSlackMessageProcessed,
  rememberSlackThread,
} from "@/lib/jobs";
import { slackInboundDedupeKey } from "@/lib/slack-dedupe";
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
  type SlackTeamContext,
} from "@/lib/slack";
import { getSlackInstall } from "@/lib/slack-install";
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

export function isSlackBotDirectMessage(channelType?: string) {
  return channelType === "im" || channelType === "mpim";
}

export function classifySlackEvent(input: {
  type: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  channelId?: string;
  channelType?: string;
  trackedThread: boolean;
  relayOutbound?: boolean;
  mentionUserId?: string;
}) {
  if (input.relayOutbound) return "ignore" as const;
  if (input.type !== "app_mention" && input.type !== "message") {
    return "ignore" as const;
  }
  const inBotDm = isSlackBotDirectMessage(input.channelType);
  const addressed =
    input.type === "app_mention" ||
    inBotDm ||
    messageTriggersRelay(input.text ?? "", {
      mentionUserId: input.mentionUserId,
    });
  const inDm = Boolean(
    input.channelId?.startsWith("D") || input.channelType === "im",
  );
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

async function resolveSlackTeamContext(
  event: SlackInboundEvent,
  options?: SlackTeamContext,
): Promise<Required<Pick<SlackTeamContext, "teamId">> & SlackTeamContext> {
  const teamId = options?.teamId ?? event.team ?? "";
  let mentionUserId = options?.mentionUserId;
  if (teamId && !mentionUserId) {
    const install = await getSlackInstall(teamId);
    mentionUserId = install?.botUserId;
  }
  return { teamId, mentionUserId };
}

export async function handleSlackEvent(
  event: SlackInboundEvent,
  options?: SlackTeamContext,
) {
  const ctx = await resolveSlackTeamContext(event, options);
  if (event.type !== "app_mention" && event.type !== "message") {
    return { ignored: true, reason: event.type };
  }
  if (shouldIgnoreSlackSubtype(event.subtype)) {
    return { ignored: true, reason: event.subtype ?? "subtype" };
  }
  if (isRelaySlackOutbound(event)) {
    return { ignored: true, reason: "relay_outbound" };
  }
  const teamId = ctx.teamId || event.team || "";
  const dedupeKey = slackInboundDedupeKey(
    event.channel,
    event.ts,
    teamId || undefined,
  );
  if (!(await markSlackMessageProcessed(dedupeKey))) {
    return { ignored: true, reason: "duplicate_message" };
  }

  const existingJob = findJobForSlackInbound(
    await listJobs(),
    event.channel,
    event.ts,
  );
  if (existingJob) {
    return { ignored: true, reason: "already_jobbed", jobId: existingJob.id };
  }

  const enriched = await enrichSlackThreadTs(event, teamId || undefined);
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
    channelType: enriched.channel_type,
    trackedThread: Boolean(tracked),
    relayOutbound: false,
    mentionUserId: ctx.mentionUserId,
  });

  if (intent === "follow_up") {
    return handleThreadMessage(enriched, ctx);
  }
  if (intent === "mention") {
    return handleMention(enriched, ctx);
  }
  console.info(
    `[relay] Slack event ignored (${enriched.channel}${enriched.channel_type ? `:${enriched.channel_type}` : ""}): not_pocketedge — ${(enriched.text ?? "").slice(0, 80)}`,
  );
  return { ignored: true, reason: "not_pocketedge" };
}

async function handleMention(
  event: SlackInboundEvent,
  ctx: SlackTeamContext & { teamId: string },
) {
  const bot = await getSlackBotIdentity(ctx.teamId || undefined);
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
    teamId: ctx.teamId || undefined,
    channelType: event.channel_type,
  });

  if (!text && files.length === 0) {
    await sendSlackMessage({
      channelId: event.channel,
      threadTs,
      teamId: ctx.teamId || undefined,
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

  await ackSlackWorking(event.channel, event.ts, ctx.teamId || undefined).catch(
    (error) => {
    console.error("[relay] Slack working reaction failed", error);
  },
  );

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
      slackTeamId: ctx.teamId || undefined,
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
      teamId: ctx.teamId || undefined,
      text: `Something went wrong before I could reach Cursor: ${detail}`,
    }).catch(() => undefined);
    return { error: detail };
  }
}

async function handleThreadMessage(
  event: SlackInboundEvent,
  ctx: SlackTeamContext & { teamId: string },
) {
  if (shouldIgnoreSlackSubtype(event.subtype)) {
    return { ignored: true, reason: event.subtype ?? "subtype" };
  }

  const bot = await getSlackBotIdentity(ctx.teamId || undefined);
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
    teamId: ctx.teamId || undefined,
    channelType: event.channel_type,
  });

  const prompt =
    text ||
    `Process the attached file${files.length === 1 ? "" : "s"} and follow any implied request.`;

  await ackSlackWorking(event.channel, event.ts, ctx.teamId || undefined).catch(
    (error) => {
    console.error("[relay] Slack working reaction failed", error);
  },
  );

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
      slackTeamId: ctx.teamId || undefined,
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
      teamId: ctx.teamId || undefined,
      text: `Something went wrong before I could reach Cursor: ${detail}`,
    }).catch(() => undefined);
    return { error: detail };
  }
}
