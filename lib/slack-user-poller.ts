import { getConfig } from "@/lib/config";
import { handleSlackEvent } from "@/lib/handle-slack";
import {
  getSlackPollCursor,
  getSlackSearchCursor,
  listSlackThreads,
  markSlackMessageProcessed,
  setSlackPollCursor,
  setSlackSearchCursor,
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
    `[relay] Slack user mode: watching for "${cfg.slackTriggerWord}" as ${actor.name ?? actor.userId} (no bot channel invites)`,
  );
  void loop(actor.userId);
}

async function loop(actorUserId: string) {
  while (true) {
    try {
      await pollSearchTriggers(actorUserId);
      await pollTrackedThreads(actorUserId);
      await pollConfiguredChannels(actorUserId);
    } catch (error) {
      console.error("[relay] Slack user poll failed", error);
    }
    await sleep(POLL_MS);
  }
}

/** Workspace search — finds pocketedge in any channel you can already read. */
async function pollSearchTriggers(actorUserId: string) {
  const cfg = getConfig();
  const client = getSlackClient();
  const cursor =
    (await getSlackSearchCursor()) ?? `${Date.now() / 1000 - 30}`;

  try {
    const result = await client.search.messages({
      query: cfg.slackTriggerWord,
      sort: "timestamp",
      sort_dir: "desc",
      count: 20,
    });
    if (!result.ok || !result.messages?.matches?.length) return;

    let newestTs = cursor;
    const ordered = [...result.messages.matches].reverse();

    for (const match of ordered) {
      if (!match.ts || !match.user || !match.channel?.id) continue;
      if (Number(match.ts) <= Number(cursor)) continue;
      if (match.user === actorUserId) continue;

      newestTs = match.ts;
      await processMessage(
        {
          type: "app_mention",
          user: match.user,
          text: match.text,
          ts: match.ts,
          thread_ts:
            "thread_ts" in match && typeof match.thread_ts === "string"
              ? match.thread_ts
              : undefined,
          channel: match.channel.id,
        },
        actorUserId,
      );
    }

    if (Number(newestTs) > Number(cursor)) {
      await setSlackSearchCursor(newestTs);
    }
  } catch (error) {
    const missing = readMissingScope(error);
    if (missing) {
      console.warn(
        `[relay] Slack search needs scope ${missing}. Add search:read on the user token, or set SLACK_CHANNEL_IDS. See docs/SLACK_SETUP.md`,
      );
    }
  }
}

/** Only threads Relay already started — catches follow-ups without pocketedge. */
async function pollTrackedThreads(actorUserId: string) {
  const threads = await listSlackThreads();
  for (const thread of threads) {
    const key = `thread:${thread.channelId}:${thread.threadTs}`;
    const cursor =
      (await getSlackPollCursor(key)) ?? thread.threadTs;
    const client = getSlackClient();

    try {
      const result = await client.conversations.replies({
        channel: thread.channelId,
        ts: thread.threadTs,
        oldest: cursor,
        limit: 50,
      });
      if (!result.ok || !result.messages?.length) continue;

      let newestTs = cursor;
      for (const message of result.messages) {
        if (!message.ts || !message.user) continue;
        if (Number(message.ts) <= Number(cursor)) continue;
        if (message.ts === thread.threadTs) continue;
        if (messageTriggersRelay(message.text ?? "")) continue;

        newestTs = message.ts;
        await processMessage(
          {
            type: "message",
            user: message.user,
            text: message.text,
            ts: message.ts,
            thread_ts: message.thread_ts ?? thread.threadTs,
            channel: thread.channelId,
            bot_id: message.bot_id,
            subtype:
              "subtype" in message && typeof message.subtype === "string"
                ? message.subtype
                : undefined,
            files: message.files?.map((file) => ({
              id: file.id ?? file.name ?? "file",
              name: file.name,
              mimetype: file.mimetype,
              size: file.size,
              url_private_download: file.url_private_download,
            })),
          },
          actorUserId,
        );
      }

      if (Number(newestTs) > Number(cursor)) {
        await setSlackPollCursor(key, newestTs);
      }
    } catch (error) {
      const missing = readMissingScope(error);
      if (missing) {
        console.warn(
          `[relay] Thread poll needs scope ${missing} for ${thread.channelId}`,
        );
      }
    }
  }
}

/** Optional explicit channel list when search is unavailable. */
async function pollConfiguredChannels(actorUserId: string) {
  const cfg = getConfig();
  if (!cfg.slackChannelIds.length) return;
  for (const channelId of cfg.slackChannelIds) {
    await pollChannel(channelId, actorUserId);
  }
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

  let newestTs = cursor;
  for (const message of [...result.messages].reverse()) {
    if (!message.ts || !message.user) continue;
    if (Number(message.ts) <= Number(cursor)) continue;
    newestTs = message.ts;

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

    if (messageTriggersRelay(message.text ?? "")) {
      event.type = "app_mention";
    }
    await processMessage(event, actorUserId);
  }

  if (Number(newestTs) > Number(cursor)) {
    await setSlackPollCursor(channelId, newestTs);
  }
}

async function processMessage(event: SlackInboundEvent, actorUserId: string) {
  const key = `${event.channel}:${event.ts}`;
  if (!(await markSlackMessageProcessed(key))) return;
  if (isSlackBotMessage(event, actorUserId)) return;
  if (shouldIgnoreSlackSubtype(event.subtype)) return;

  await handleSlackEvent(event).catch((error) => {
    console.error("[relay] Slack message handler failed", error);
  });
}

function readMissingScope(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "needed" in error.data &&
    typeof error.data.needed === "string"
  ) {
    return error.data.needed;
  }
  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
