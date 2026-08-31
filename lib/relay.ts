import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

import { getConfig } from "@/lib/config";
import { dispatchToCursor } from "@/lib/cursor";
import {
  addJobEvent,
  createJob,
  getJob,
  latestChat,
  listChats,
} from "@/lib/jobs";
import { sendTelegramMessage } from "@/lib/telegram";
import type { Job, JobSource } from "@/lib/types";

export async function ingestAndDispatch(input: {
  source: JobSource;
  prompt: string;
  chatId?: number;
  username?: string;
  displayName?: string;
}): Promise<Job> {
  const job = await createJob(input);

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
      if (input.chatId) {
        await sendTelegramMessage({
          chatId: input.chatId,
          text: [
            "I reached Cursor, but the automation did not accept the request.",
            `${detail}.`,
            "Turn the automation on at cursor.com/automations, then send this again.",
          ].join(" "),
        }).catch(() => undefined);
      }
      return (await getJob(job.id)) ?? job;
    }

    return (await addJobEvent(
      job.id,
      {
        type: "dispatched",
        detail: `Posted to Cursor automation (HTTP ${result.status})`,
      },
      {
        status: "dispatched",
        cursorHttpStatus: result.status,
        cursorBody: result.body,
      },
    )) as Job;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Dispatch failed";
    await addJobEvent(
      job.id,
      { type: "cursor_error", detail },
      { status: "error", error: detail },
    );
    if (input.chatId) {
      await sendTelegramMessage({
        chatId: input.chatId,
        text: `I could not reach Cursor: ${detail}`,
      }).catch(() => undefined);
    }
    return (await getJob(job.id)) ?? job;
  }
}

export async function deliverReply(input: {
  jobId?: string;
  chatId?: number;
  status: string;
  message: string;
  job?: Job;
}) {
  const cfg = getConfig();
  const chats = await listChats();
  const fallbackChat = await latestChat();
  const envChatId = cfg.telegramChatId ? Number(cfg.telegramChatId) : undefined;
  const chatId =
    input.chatId ??
    input.job?.chatId ??
    (Number.isFinite(envChatId) ? envChatId : undefined) ??
    fallbackChat?.chatId ??
    chats[0]?.chatId;

  let telegramMessageId: number | undefined;
  if (chatId && cfg.telegramConfigured) {
    telegramMessageId = await sendTelegramMessage({
      chatId,
      text: input.message,
    });
  }

  return { chatId, telegramMessageId };
}

function cursorErrorDetail(status: number, body: unknown) {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return `Cursor webhook returned HTTP ${status}`;
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
