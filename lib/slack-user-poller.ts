import { getConfig } from "@/lib/config";
import { handleSlackEvent, isRelaySlackOutbound, isSlackThreadReply } from "@/lib/handle-slack";
import {
  getSlackPollCursor,
  getSlackSearchCursor,
  getSlackThread,
  listSlackThreads,
  setSlackPollCursor,
  setSlackSearchCursor,
} from "@/lib/jobs";
import { getStore, updateStore } from "@/lib/store";
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
const MIN_POLL_GAP_MS = 30_000;

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
    `[relay] Slack user mode: watching for "${cfg.slackTriggerWord}" as ${actor.name ?? actor.userId} (replies as you)`,
  );
  void loop(actor.userId);
}

/** One search + thread pass. Used on Vercel where a long poller cannot stay alive. */
export async function pollSlackOnce(options?: { force?: boolean }) {
  const cfg = getConfig();
  if (!cfg.slackUserPollConfigured) return { ok: false, reason: "no_user_token" };
  if (!options?.force) {
    const last = Date.parse((await getStore()).slackLastPollAt ?? "") || 0;
    if (Date.now() - last < MIN_POLL_GAP_MS) {
      return { ok: true, skipped: true, reason: "throttled" };
    }
    await updateStore((data) => {
      data.slackLastPollAt = new Date().toISOString();
    });
  }
  const actor = await getSlackBotIdentity();
  await runPollStep("search", () => pollSearchTriggers(actor.userId));
  await runPollStep("threads", () => pollTrackedThreads(actor.userId));
  await runPollStep("channels", () => pollConfiguredChannels(actor.userId));
  return { ok: true, actor: actor.name ?? actor.userId };
}

/** Opportunistic scan from Telegram/Slack webhooks — never self-reschedule. */
export async function kickSlackMentionScan() {
  const cfg = getConfig();
  if (!cfg.slackUserPollConfigured) return;
  await pollSlackOnce().catch((error) => {
    console.error("[relay] Slack mention scan failed", error);
  });
}

async function loop(actorUserId: string) {
  while (true) {
    await runPollStep("search", () => pollSearchTriggers(actorUserId));
    await runPollStep("dms", () => pollDirectMessages(actorUserId));
    await runPollStep("threads", () => pollTrackedThreads(actorUserId));
    await runPollStep("channels", () => pollConfiguredChannels(actorUserId));
    await sleep(POLL_MS);
  }
}

async function runPollStep(
  label: string,
  step: () => Promise<void>,
) {
  try {
    await step();
  } catch (error) {
    console.error(`[relay] Slack ${label} poll failed`, error);
  }
}

/** Direct messages and group DMs you are already in. */
async function pollDirectMessages(actorUserId: string) {
  const client = getSlackClient();
  let channels: string[] = [];
  try {
    const result = await client.users.conversations({
      types: "im",
      exclude_archived: true,
      limit: 50,
    });
    if (result.ok && result.channels?.length) {
      channels = result.channels
        .map((channel) => channel.id)
        .filter((id): id is string => Boolean(id));
    }
  } catch (error) {
    const missing = readMissingScope(error);
    if (missing) {
      console.warn(
        `[relay] Slack DMs need scope ${missing}. Add im:history and im:read on the user token.`,
      );
    }
    return;
  }
  for (const channelId of channels) {
    await pollChannel(channelId, actorUserId);
  }
}

/** Workspace search — finds pocketedge in any channel you can already read. */
async function pollSearchTriggers(actorUserId: string) {
  const cfg = getConfig();
  const client = getSlackClient();
  const cursor =
    (await getSlackSearchCursor()) ?? `${Date.now() / 1000 - 3600}`;

  try {
    const result = await client.search.messages({
      query: `${cfg.slackTriggerWord} OR @${cfg.slackTriggerWord}`,
      sort: "timestamp",
      sort_dir: "desc",
      count: 50,
    });
    if (!result.ok || !result.messages?.matches?.length) return;

    let newestTs = cursor;
    const ordered = [...result.messages.matches].reverse();

    for (const match of ordered) {
      if (!match.ts || !match.user || !match.channel?.id) continue;
      if (Number(match.ts) <= Number(cursor)) continue;
      const text = match.text ?? "";
      if (match.user === actorUserId && !messageTriggersRelay(text)) continue;

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
  const threads = (await listSlackThreads())
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 8);
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
            metadata:
              message.metadata && typeof message.metadata.event_type === "string"
                ? { event_type: message.metadata.event_type }
                : undefined,
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
  const cursor = (await getSlackPollCursor(channelId)) ?? `${Date.now() / 1000 - 3600}`;
  const client = getSlackClient();
  let result;
  try {
    result = await client.conversations.history({
      channel: channelId,
      oldest: cursor,
      limit: 50,
    });
  } catch (error) {
    const missing = readMissingScope(error);
    if (missing) {
      console.warn(
        `[relay] Slack channel ${channelId} needs scope ${missing}`,
      );
    }
    return;
  }
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
  if (isRelaySlackOutbound(event)) return;
  if (shouldIgnoreSlackSubtype(event.subtype)) return;

  const ownMessage = event.user === actorUserId;
  const addressed =
    messageTriggersRelay(event.text ?? "") || event.type === "app_mention";
  if (ownMessage && !addressed) {
    const threadTs = isSlackThreadReply(event) ? event.thread_ts : undefined;
    const inDm = event.channel.startsWith("D");
    if (!threadTs || !inDm) return;
    const tracked = await getSlackThread(event.channel, threadTs);
    if (!tracked) return;
  }
  if (!ownMessage && isSlackBotMessage(event, actorUserId)) return;

  console.info(
    `[relay] Slack ${isSlackThreadReply(event) ? "thread reply" : "trigger"} in ${event.channel}: ${(event.text ?? "").slice(0, 80)}`,
  );

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
