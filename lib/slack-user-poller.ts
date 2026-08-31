import { getConfig } from "@/lib/config";
import { handleSlackEvent } from "@/lib/handle-slack";
import {
  getSlackPollCursor,
  markSlackMessageProcessed,
  setSlackPollCursor,
} from "@/lib/jobs";
import {
  getSlackBotIdentity,
  getSlackClient,
  isSlackBotMessage,
  messageTriggersRelay,
  shouldIgnoreSlackSubtype,
} from "@/lib/slack";
import type { SlackInboundEvent } from "@/lib/types";

declare global {
  var __relaySlackUserPoller: { started: boolean } | undefined;
}

const POLL_MS = 3000;

export async function startSlackUserPoller() {
  if (globalThis.__relaySlackUserPoller?.started) return;
  const cfg = getConfig();
  if (!cfg.slackUserPollConfigured) return;

  globalThis.__relaySlackUserPoller = { started: true };
  const actor = await getSlackBotIdentity().catch((error) => {
    console.error("[relay] Slack user token auth failed", error);
    globalThis.__relaySlackUserPoller = { started: false };
    return null;
  });
  if (!actor) return;

  console.info(
    `[relay] Slack user-token poller watching for @${cfg.slackTriggerWord} as ${actor.name ?? actor.userId}`,
  );
  void loop(actor.userId);
}

async function loop(actorUserId: string) {
  while (true) {
    try {
      const channels = await listWatchChannels();
      for (const channelId of channels) {
        await pollChannel(channelId, actorUserId);
      }
    } catch (error) {
      console.error("[relay] Slack user poll failed", error);
    }
    await sleep(POLL_MS);
  }
}

async function listWatchChannels() {
  const cfg = getConfig();
  if (cfg.slackChannelIds.length) return cfg.slackChannelIds;

  const client = getSlackClient();
  const result = await client.users.conversations({
    types: "public_channel,private_channel",
    exclude_archived: true,
    limit: 50,
  });
  if (!result.ok || !result.channels?.length) return [];
  return result.channels
    .map((channel) => channel.id)
    .filter((id): id is string => Boolean(id));
}

async function pollChannel(channelId: string, actorUserId: string) {
  const cursor = (await getSlackPollCursor(channelId)) ?? `${Date.now() / 1000 - 5}`;
  const client = getSlackClient();
  const result = await client.conversations.history({
    channel: channelId,
    oldest: cursor,
    limit: 50,
  });
  if (!result.ok || !result.messages?.length) return;

  const ordered = [...result.messages].reverse();
  let newestTs = cursor;

  for (const message of ordered) {
    if (!message.ts || !message.user) continue;
    if (Number(message.ts) <= Number(cursor)) continue;

    newestTs = message.ts;
    const key = `${channelId}:${message.ts}`;
    if (!(await markSlackMessageProcessed(key))) continue;

    const event: SlackInboundEvent = {
      type: "message",
      user: message.user,
      text: message.text,
      ts: message.ts,
      thread_ts: message.thread_ts,
      channel: channelId,
      bot_id: message.bot_id,
      subtype: message.subtype,
      files: message.files?.map((file) => ({
        id: file.id ?? file.name ?? "file",
        name: file.name,
        mimetype: file.mimetype,
        size: file.size,
        url_private_download: file.url_private_download,
      })),
    };

    if (isSlackBotMessage(event, actorUserId)) continue;
    if (shouldIgnoreSlackSubtype(event.subtype)) continue;

    if (messageTriggersRelay(message.text ?? "")) {
      event.type = "app_mention";
      await handleSlackEvent(event).catch((error) => {
        console.error("[relay] Slack trigger handler failed", error);
      });
      continue;
    }

    if (message.thread_ts && message.thread_ts !== message.ts) {
      await handleSlackEvent(event).catch((error) => {
        console.error("[relay] Slack thread handler failed", error);
      });
    }
  }

  if (Number(newestTs) > Number(cursor)) {
    await setSlackPollCursor(channelId, newestTs);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
