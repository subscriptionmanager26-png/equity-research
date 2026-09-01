import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

import { getConfig } from "@/lib/config";
import { dispatchToCursor } from "@/lib/cursor";
import { extractAgentId } from "@/lib/cursor-api";
import {
  formatReplyForJob,
  markdownFileCaption,
  type DeliveryFile,
  type FormattedDelivery,
} from "@/lib/delivery-format";
import {
  addJobEvent,
  createJob,
  getJob,
  latestChat,
  listChats,
} from "@/lib/jobs";
import { ackSlackDone, sendSlackFile, sendSlackMessage } from "@/lib/slack";
import { sendTelegramFile, sendTelegramMessage } from "@/lib/telegram";
import type { Job, JobSource, TelegramChat } from "@/lib/types";

export async function ingestAndDispatch(input: {
  source: JobSource;
  prompt: string;
  chatId?: number;
  username?: string;
  displayName?: string;
  threadContext?: string;
  slackChannelId?: string;
  slackThreadTs?: string;
  slackUserId?: string;
  slackMessageTs?: string;
  files?: Job["files"];
  followUpAgentId?: string;
  telegramInboundMessageId?: number;
  telegramAckMessageId?: number;
}): Promise<Job> {
  const cfg = getConfig();
  const fallback = input.source === "dashboard" ? await latestChat() : undefined;
  const envChatId = cfg.telegramChatId ? Number(cfg.telegramChatId) : undefined;
  const chatId = resolveJobChatId({
    source: input.source,
    chatId: input.chatId,
    envChatId: Number.isFinite(envChatId) ? envChatId : undefined,
    fallbackChatId: fallback?.chatId,
  });
  const job = await createJob({
    ...input,
    chatId,
    username:
      input.username ??
      (input.source === "dashboard" ? fallback?.username : undefined),
    displayName:
      input.displayName ??
      (input.source === "dashboard" ? fallback?.displayName : undefined),
  });

  try {
    const result = await dispatchToCursor(job);
    if (!result.ok) {
      const detail = cursorErrorDetail(result.status, result.body);
      await addJobEvent(
        job.id,
        { type: "cursor_error", detail },
        {
          status: "error",
          error: detail,
          cursorHttpStatus: result.status,
          cursorBody: result.body,
        },
      );
      await notifyJobFailure(job, [
        "I reached Cursor, but the cloud agent did not start.",
        `${detail}.`,
      ].join(" "));
      return (await getJob(job.id)) ?? job;
    }

    const agentId = extractAgentId(result.body);
    return (await addJobEvent(
      job.id,
      {
        type: "dispatched",
        detail: agentId
          ? `Started Cursor cloud agent (${agentId})`
          : `Started Cursor cloud agent (HTTP ${result.status})`,
      },
      {
        status: "dispatched",
        cursorHttpStatus: result.status,
        cursorBody: result.body,
        cursorAgentId: agentId,
      },
    )) as Job;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Dispatch failed";
    await addJobEvent(
      job.id,
      { type: "cursor_error", detail },
      { status: "error", error: detail },
    );
    await notifyJobFailure(job, `I could not reach Cursor: ${detail}`);
    return (await getJob(job.id)) ?? job;
  }
}

export type DeliveryResult = {
  chatId?: number;
  telegramMessageId?: number;
  slackChannelId?: string;
  slackThreadTs?: string;
  slackMessageTs?: string;
  files: string[];
};

export async function deliverReply(input: {
  jobId?: string;
  chatId?: number;
  status: string;
  message: string;
  job?: Job;
  files?: DeliveryFile[];
}): Promise<DeliveryResult> {
  const cfg = getConfig();
  const job =
    input.job ?? (input.jobId ? await getJob(input.jobId) : undefined);

  const formatted = formatReplyForJob(
    input.message,
    input.files ?? [],
    job?.prompt,
  );

  if (job?.source === "slack" && job.slackChannelId && job.slackThreadTs) {
    return deliverSlackReply(job, formatted);
  }

  const chats = await listChats();
  const fallbackChat = await latestChat();
  const envChatId = cfg.telegramChatId ? Number(cfg.telegramChatId) : undefined;
  const chatId = resolveDeliveryChatId({
    explicitChatId: input.chatId,
    job,
    envChatId: Number.isFinite(envChatId) ? envChatId : undefined,
    fallbackChat,
    chats,
  });

  let telegramMessageId: number | undefined;
  const deliveredFiles: string[] = [];
  const uploadErrors: string[] = [];
  if (chatId && cfg.telegramConfigured) {
    if (formatted.text) {
      telegramMessageId = await sendTelegramMessage({
        chatId,
        text: formatted.text,
      });
    }
    for (const file of formatted.files) {
      try {
        telegramMessageId = await sendTelegramFile({
          chatId,
          name: file.name,
          bytes: file.bytes,
          mime: file.mime,
          caption:
            !formatted.text && deliveredFiles.length === 0
              ? markdownFileCaption(file.name) ?? file.name
              : undefined,
        });
        deliveredFiles.push(file.name);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "upload failed";
        console.error(`[relay] Telegram file ${file.name} failed`, error);
        uploadErrors.push(`${file.name}: ${detail}`);
      }
    }
    if (uploadErrors.length) {
      telegramMessageId = await sendTelegramMessage({
        chatId,
        text: `Could not attach file(s): ${uploadErrors.join("; ")}`,
      }).catch(() => telegramMessageId);
    }
  }

  return { chatId, telegramMessageId, files: deliveredFiles };
}

async function deliverSlackReply(
  job: Job,
  formatted: FormattedDelivery,
): Promise<DeliveryResult> {
  const cfg = getConfig();
  if (!cfg.slackConfigured || !job.slackChannelId || !job.slackThreadTs) {
    return { files: [] };
  }

  let slackMessageTs: string | undefined;
  const deliveredFiles: string[] = [];
  const uploadErrors: string[] = [];
  if (formatted.text) {
    slackMessageTs = await sendSlackMessage({
      channelId: job.slackChannelId,
      threadTs: job.slackThreadTs,
      text: formatted.text,
    });
  }
  for (const file of formatted.files) {
    try {
      await sendSlackFile({
        channelId: job.slackChannelId,
        threadTs: job.slackThreadTs,
        name: file.name,
        bytes: file.bytes,
        mime: file.mime,
        title: markdownFileCaption(file.name) ?? file.name,
      });
      deliveredFiles.push(file.name);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "upload failed";
      console.error(`[relay] Slack file ${file.name} failed`, error);
      uploadErrors.push(`${file.name}: ${detail}`);
    }
  }

  if (uploadErrors.length && job.slackChannelId && job.slackThreadTs) {
    await sendSlackMessage({
      channelId: job.slackChannelId,
      threadTs: job.slackThreadTs,
      text: `Could not attach file(s): ${uploadErrors.join("; ")}`,
    }).catch(() => undefined);
  }

  await ackSlackDone(
    job.slackChannelId,
    job.slackMessageTs ?? job.slackThreadTs,
  ).catch((error) => {
    console.error("[relay] Slack done reaction failed", error);
  });

  return {
    slackChannelId: job.slackChannelId,
    slackThreadTs: job.slackThreadTs,
    slackMessageTs,
    files: deliveredFiles,
  };
}

async function notifyJobFailure(job: Job, text: string) {
  if (job.source === "slack" && job.slackChannelId && job.slackThreadTs) {
    await sendSlackMessage({
      channelId: job.slackChannelId,
      threadTs: job.slackThreadTs,
      text,
    }).catch(() => undefined);
    return;
  }
  if (job.chatId) {
    await sendTelegramMessage({ chatId: job.chatId, text }).catch(() => undefined);
  }
}

function resolveJobChatId(input: {
  source: JobSource;
  chatId?: number;
  envChatId?: number;
  fallbackChatId?: number;
}) {
  if (input.chatId !== undefined) return input.chatId;
  if (input.source === "telegram" || input.source === "slack") return undefined;
  return input.envChatId ?? input.fallbackChatId;
}

function resolveDeliveryChatId(input: {
  explicitChatId?: number;
  job?: Job;
  envChatId?: number;
  fallbackChat?: TelegramChat;
  chats: TelegramChat[];
}) {
  if (input.explicitChatId !== undefined) return input.explicitChatId;
  if (input.job?.chatId !== undefined) return input.job.chatId;
  if (input.job?.source === "telegram" || input.job?.source === "slack") {
    return undefined;
  }
  return (
    input.envChatId ?? input.fallbackChat?.chatId ?? input.chats[0]?.chatId
  );
}

function cursorErrorDetail(status: number, body: unknown) {
  if (body && typeof body === "object") {
    const record = body as {
      error?: unknown;
      message?: unknown;
      details?: unknown;
    };
    if (typeof record.error === "string" && record.error.trim()) {
      const extras = Array.isArray(record.details)
        ? record.details
            .map((item) => {
              if (item && typeof item === "object" && "message" in item) {
                const message = (item as { message?: unknown }).message;
                return typeof message === "string" ? message : "";
              }
              return "";
            })
            .filter(Boolean)
        : [];
      return extras.length
        ? `${record.error.trim()} (${extras.join("; ")})`
        : record.error.trim();
    }
    if (record.error && typeof record.error === "object") {
      const nested = record.error as { message?: unknown; code?: unknown };
      if (typeof nested.message === "string" && nested.message.trim()) {
        return nested.message.trim();
      }
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
  }
  return `Cursor API returned HTTP ${status}`;
}

export function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return nodeTimingSafeEqual(left, right);
}

export function bearerToken(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

export function deliveryDetail(
  job: Job | undefined,
  delivery: {
    chatId?: number;
    slackChannelId?: string;
    slackThreadTs?: string;
    files?: string[];
  },
) {
  const fileNote = delivery.files?.length
    ? ` with ${delivery.files.join(", ")}`
    : "";
  if (job?.source === "slack" && delivery.slackChannelId) {
    return `Delivered Cursor result to Slack ${delivery.slackChannelId} thread ${delivery.slackThreadTs ?? ""}${fileNote}`.trim();
  }
  if (delivery.chatId) {
    return `Delivered Cursor result to Telegram chat ${delivery.chatId}${fileNote}`;
  }
  return `Stored Cursor result${fileNote}`;
}
