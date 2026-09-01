import crypto from "node:crypto";

import { WebClient } from "@slack/web-api";

import { markdownToSlackMrkdwn } from "@/lib/chat-markup";
import { getConfig } from "@/lib/config";
import { markSlackMessageProcessed } from "@/lib/jobs";
import { updateStore } from "@/lib/store";
import type { JobFile, SlackInboundEvent } from "@/lib/types";

let botClient: WebClient | undefined;
let userClient: WebClient | undefined;

export function getSlackAuthToken() {
  const { slackUserToken, slackBotToken } = getConfig();
  const token = slackUserToken || slackBotToken;
  if (!token) {
    throw new Error("Set SLACK_USER_TOKEN or SLACK_BOT_TOKEN");
  }
  return token;
}

export function getSlackClient() {
  const cfg = getConfig();
  if (cfg.slackUserToken) {
    userClient ??= new WebClient(cfg.slackUserToken);
    return userClient;
  }
  if (cfg.slackBotToken) {
    botClient ??= new WebClient(cfg.slackBotToken);
    return botClient;
  }
  throw new Error("Set SLACK_USER_TOKEN or SLACK_BOT_TOKEN");
}

export function relayActorLabel() {
  const { slackTriggerWord } = getConfig();
  return `@${slackTriggerWord}`;
}

export function messageTriggersRelay(text: string) {
  const cfg = getConfig();
  const body = text ?? "";
  if (cfg.slackMentionUserId && body.includes(`<@${cfg.slackMentionUserId}>`)) {
    return true;
  }
  if (/<@[A-Z0-9]+\|[^>]*pocketedge[^>]*>/i.test(body)) {
    return true;
  }
  const stripped = stripSlackMentions(body);
  const word = cfg.slackTriggerWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@?${word}\\b`, "i").test(stripped);
}

export async function getSlackBotIdentity() {
  const stored = (await import("@/lib/store")).getStore().then((s) => s.slackBot);
  const cached = await stored;
  if (cached?.userId) return cached;

  const result = await getSlackClient().auth.test();
  if (!result.ok || !result.user_id) {
    throw new Error("Slack auth.test failed");
  }
  const identity = {
    id: result.user_id,
    userId: result.user_id,
    teamId: result.team_id,
    name: result.user,
    checkedAt: new Date().toISOString(),
  };
  await updateStore((data) => {
    data.slackBot = identity;
  });
  return identity;
}

export function verifySlackSignature(input: {
  signingSecret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
}) {
  const fiveMinutes = 60 * 5;
  if (Math.abs(Date.now() / 1000 - Number(input.timestamp)) > fiveMinutes) {
    return false;
  }
  const base = `v0:${input.timestamp}:${input.rawBody}`;
  const digest = crypto
    .createHmac("sha256", input.signingSecret)
    .update(base)
    .digest("hex");
  const expected = `v0=${digest}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(input.signature);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function stripSlackMentions(text: string) {
  return text
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/<#[A-Z0-9]+\|[^>]+>/g, "")
    .replace(/<#[A-Z0-9]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function attachmentsFromSlackEvent(
  event: SlackInboundEvent,
): JobFile[] {
  return (event.files ?? []).map((file) => ({
    fileId: file.id,
    name: file.name ?? "attachment",
    mime: file.mimetype,
    size: file.size,
    url: file.url_private_download,
  }));
}

export async function fetchThreadContext(input: {
  channelId: string;
  threadTs: string;
  excludeTs?: string;
  limit?: number;
}) {
  const result = await getSlackClient().conversations.replies({
    channel: input.channelId,
    ts: input.threadTs,
    limit: input.limit ?? 50,
  });
  if (!result.ok || !result.messages?.length) return "";

  const bot = await getSlackBotIdentity();
  const lines: string[] = [];
  for (const message of result.messages) {
    if (message.ts === input.excludeTs) continue;
    const text = stripSlackMentions(message.text ?? "").trim();
    if (!text) continue;
    const speaker =
      message.user === bot.userId
        ? relayActorLabel()
        : message.user
          ? `User ${message.user}`
          : "Someone";
    lines.push(`${speaker}: ${text}`);
  }
  return lines.join("\n");
}

export async function sendSlackMessage(input: {
  channelId: string;
  text: string;
  threadTs?: string;
}) {
  const chunks = splitSlackText(markdownToSlackMrkdwn(input.text) || input.text);
  let lastTs: string | undefined;
  for (const chunk of chunks) {
    const thread = input.threadTs ? { thread_ts: input.threadTs } : {};
    let result = await getSlackClient().chat.postMessage({
      channel: input.channelId,
      text: chunk,
      mrkdwn: true,
      metadata: {
        event_type: "relay_delivery",
        event_payload: { app: "relay" },
      },
      ...thread,
    });
    if (!result.ok && String(result.error ?? "").includes("metadata")) {
      result = await getSlackClient().chat.postMessage({
        channel: input.channelId,
        text: chunk,
        mrkdwn: true,
        ...thread,
      });
    }
    if (!result.ok) {
      throw new Error(result.error ?? "Slack chat.postMessage failed");
    }
    lastTs = result.ts;
    if (lastTs) {
      await markSlackMessageProcessed(`${input.channelId}:${lastTs}`).catch(
        () => undefined,
      );
    }
  }
  return lastTs;
}

const SLACK_WORKING_REACTION = "eyes";
const SLACK_DONE_REACTION = "thumbsup";

export async function addSlackReaction(input: {
  channelId: string;
  timestamp: string;
  name: string;
}) {
  const result = await getSlackClient().reactions.add({
    channel: input.channelId,
    timestamp: input.timestamp,
    name: input.name,
  });
  if (result.ok || result.error === "already_reacted") return;
  throw new Error(result.error ?? "Slack reactions.add failed");
}

export async function removeSlackReaction(input: {
  channelId: string;
  timestamp: string;
  name: string;
}) {
  const result = await getSlackClient().reactions.remove({
    channel: input.channelId,
    timestamp: input.timestamp,
    name: input.name,
  });
  if (result.ok || result.error === "no_reaction") return;
  throw new Error(result.error ?? "Slack reactions.remove failed");
}

/** 👀 — picked up, still working. */
export async function ackSlackWorking(channelId: string, timestamp?: string) {
  if (!timestamp) return;
  await addSlackReaction({
    channelId,
    timestamp,
    name: SLACK_WORKING_REACTION,
  });
}

/** Swap 👀 for 👍 when the Cursor answer is posted. */
export async function ackSlackDone(channelId: string, timestamp?: string) {
  if (!timestamp) return;
  await removeSlackReaction({
    channelId,
    timestamp,
    name: SLACK_WORKING_REACTION,
  }).catch(() => undefined);
  await addSlackReaction({
    channelId,
    timestamp,
    name: SLACK_DONE_REACTION,
  });
}

export async function sendSlackFile(input: {
  channelId: string;
  name: string;
  bytes: Uint8Array;
  mime?: string;
  threadTs: string;
  title?: string;
}) {
  const copy = new Uint8Array(input.bytes.byteLength);
  copy.set(input.bytes);
  const result = await getSlackClient().filesUploadV2({
    channel_id: input.channelId,
    thread_ts: input.threadTs,
    filename: input.name,
    title: input.title ?? input.name,
    file: Buffer.from(copy),
  });
  if (!result.ok) {
    const detail =
      "error" in result && typeof result.error === "string"
        ? result.error
        : "Slack files.upload failed";
    throw new Error(detail);
  }
}

function splitSlackText(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function isSlackBotMessage(
  event: SlackInboundEvent,
  botUserId?: string,
) {
  if (event.bot_id) return true;
  // User-token mode posts as the human; only real bot_id traffic is bot traffic.
  if (getConfig().slackReplyAsUser) return false;
  if (botUserId && event.user === botUserId) return true;
  return false;
}

export function shouldIgnoreSlackSubtype(subtype?: string) {
  if (!subtype) return false;
  return !["file_share", "thread_broadcast"].includes(subtype);
}
