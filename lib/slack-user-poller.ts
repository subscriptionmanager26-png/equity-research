import { getConfig } from "@/lib/config";
import { handleSlackEvent, isRelaySlackOutbound, isSlackThreadReply } from "@/lib/handle-slack";
import {
  getSlackPollCursor,
  getSlackThread,
  listSlackThreads,
  rememberSlackThreadsFromJobs,
  setSlackPollCursor,
} from "@/lib/jobs";
import {
  buildSlackMentionSearchQuery,
  slackThreadTsFromSearchMatch,
  slackTsInLookback,
} from "@/lib/slack-search";
import { acquireSlackPollChainSlot, getStore, updateStore } from "@/lib/store";
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
const MIN_POLL_GAP_MS = 45_000;
const CHAIN_INTERVAL_MS = 56_000;
/** Hobby maxDuration is 60s; a 56s sleep inside waitUntil 504s the request. */
const MAX_CHAIN_SLEEP_MS = 12_000;
const MAX_NEW_MESSAGES_PER_VERCEL_POLL = 3;
const STALE_CHAIN_MS = 90_000;

type SlackPollCtx = {
  processed: Set<string>;
  remainingNew: number;
};

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

export type SlackPollResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  actor?: string;
  jobIds?: string[];
};

/** One search + thread pass. Used on Vercel where a long poller cannot stay alive. */
export async function pollSlackOnce(options?: {
  force?: boolean;
}): Promise<SlackPollResult> {
  const cfg = getConfig();
  if (!cfg.slackUserPollConfigured) return { ok: false, reason: "no_user_token" };
  const claimed = await updateStore((data) => {
    const last = Date.parse(data.slackLastPollAt ?? "") || 0;
    if (!options?.force && Date.now() - last < MIN_POLL_GAP_MS) {
      return false;
    }
    data.slackLastPollAt = new Date().toISOString();
    return true;
  });
  if (!claimed) {
    return { ok: true, skipped: true, reason: "throttled", jobIds: [] };
  }
  const actor = await getSlackBotIdentity();
  const jobIds: string[] = [];
  const ctx: SlackPollCtx = {
    processed: new Set((await getStore()).processedSlackMessages ?? []),
    remainingNew: MAX_NEW_MESSAGES_PER_VERCEL_POLL,
  };
  await hydrateSlackThreadsFromJobs();
  await runPollStep("search", () => pollSearchTriggers(actor.userId, jobIds, ctx));
  await runPollStep("threads", () => pollTrackedThreads(actor.userId, jobIds, ctx));
  await runPollStep("channels", () => pollConfiguredChannels(actor.userId, jobIds, ctx));
  return { ok: true, actor: actor.name ?? actor.userId, jobIds };
}

export async function maybeStartSlackPollChain() {
  const cfg = getConfig();
  if (!cfg.vercel || !cfg.slackUserPollConfigured || !cfg.publicUrl) return;
  const last = Date.parse((await getStore()).slackLastPollAt ?? "") || 0;
  if (Date.now() - last < STALE_CHAIN_MS) return;
  await triggerSlackPollRequest({ waitForComplete: false });
}

export async function scheduleNextSlackPoll(startedAt = Date.now()) {
  const cfg = getConfig();
  if (!cfg.vercel || !cfg.publicUrl || !cfg.slackUserPollConfigured) return;
  if (!(await acquireSlackPollChainSlot(52))) {
    return;
  }
  const wait = Math.min(
    MAX_CHAIN_SLEEP_MS,
    Math.max(3_000, CHAIN_INTERVAL_MS - (Date.now() - startedAt)),
  );
  await sleep(wait);
  // Do not wait for the next poll's after() work — that would nest
  // 56s sleeps and freeze this function until maxDuration.
  await triggerSlackPollRequest({ waitForComplete: false });
}

export async function triggerSlackPollRequest(opts?: {
  waitForComplete?: boolean;
}) {
  const cfg = getConfig();
  if (!cfg.publicUrl) return;
  const secret = process.env.CRON_SECRET?.trim();
  const headers: Record<string, string> = {};
  if (secret) headers.Authorization = `Bearer ${secret}`;
  const waitForComplete = opts?.waitForComplete !== false;
  const response = await fetch(`${cfg.publicUrl}/api/slack/poll`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(waitForComplete ? 25_000 : 12_000),
  });
  if (!response.ok) {
    throw new Error(`Slack poll HTTP ${response.status}`);
  }
  if (!waitForComplete) {
    await response.body?.cancel();
  }
}

async function hydrateSlackThreadsFromJobs() {
  await rememberSlackThreadsFromJobs();
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
  const jobIds: string[] = [];
  while (true) {
    jobIds.length = 0;
    await runPollStep("search", () => pollSearchTriggers(actorUserId, jobIds));
    await runPollStep("dms", () => pollDirectMessages(actorUserId, jobIds));
    await runPollStep("threads", () => pollTrackedThreads(actorUserId, jobIds));
    await runPollStep("channels", () =>
      pollConfiguredChannels(actorUserId, jobIds),
    );
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
async function pollDirectMessages(actorUserId: string, jobIds: string[]) {
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
    await pollChannel(channelId, actorUserId, jobIds);
  }
}

/** Workspace search — finds pocketedge in any channel you can already read. */
async function pollSearchTriggers(
  actorUserId: string,
  jobIds: string[],
  ctx?: SlackPollCtx,
) {
  const cfg = getConfig();
  const client = getSlackClient();

  try {
    const result = await client.search.messages({
      query: buildSlackMentionSearchQuery({
        triggerWord: cfg.slackTriggerWord,
        mentionUserId: cfg.slackMentionUserId,
      }),
      sort: "timestamp",
      sort_dir: "desc",
      count: 50,
    });
    if (!result.ok || !result.messages?.matches?.length) return;

    const ordered = result.messages.matches;

    for (const match of ordered) {
      if (!match.ts || !match.user || !match.channel?.id) continue;
      if (!slackTsInLookback(match.ts)) continue;
      const text = match.text ?? "";
      if (!messageTriggersRelay(text)) continue;
      const threadTs = slackThreadTsFromSearchMatch({
        ts: match.ts,
        thread_ts:
          "thread_ts" in match && typeof match.thread_ts === "string"
            ? match.thread_ts
            : undefined,
        permalink:
          "permalink" in match && typeof match.permalink === "string"
            ? match.permalink
            : undefined,
      });

      await processMessage(
        {
          type: threadTs ? "message" : "app_mention",
          user: match.user,
          text: match.text,
          ts: match.ts,
          thread_ts: threadTs,
          permalink:
            "permalink" in match && typeof match.permalink === "string"
              ? match.permalink
              : undefined,
          channel: match.channel.id,
        },
        actorUserId,
        jobIds,
        ctx,
      );
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
async function pollTrackedThreads(
  actorUserId: string,
  jobIds: string[],
  ctx?: SlackPollCtx,
) {
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
          jobIds,
          ctx,
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
async function pollConfiguredChannels(
  actorUserId: string,
  jobIds: string[],
  ctx?: SlackPollCtx,
) {
  const cfg = getConfig();
  if (!cfg.slackChannelIds.length) return;
  for (const channelId of cfg.slackChannelIds) {
    await pollChannel(channelId, actorUserId, jobIds, ctx);
  }
}

async function pollChannel(
  channelId: string,
  actorUserId: string,
  jobIds: string[] = [],
  ctx?: SlackPollCtx,
) {
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
    await processMessage(event, actorUserId, jobIds, ctx);
  }

  if (Number(newestTs) > Number(cursor)) {
    await setSlackPollCursor(channelId, newestTs);
  }
}

async function processMessage(
  event: SlackInboundEvent,
  actorUserId: string,
  jobIds: string[] = [],
  ctx?: SlackPollCtx,
) {
  const messageKey = `${event.channel}:${event.ts}`;
  if (ctx?.processed.has(messageKey)) return;
  if (ctx && ctx.remainingNew <= 0) return;

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

  if (ctx) {
    ctx.processed.add(messageKey);
    ctx.remainingNew -= 1;
  }

  console.info(
    `[relay] Slack ${isSlackThreadReply(event) ? "thread reply" : "trigger"} in ${event.channel}: ${(event.text ?? "").slice(0, 80)}`,
  );

  const result = await handleSlackEvent(event).catch((error) => {
    console.error("[relay] Slack message handler failed", error);
    return undefined;
  });
  if (result && "jobId" in result && result.jobId) {
    jobIds.push(result.jobId);
  }
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
