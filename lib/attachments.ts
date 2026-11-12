import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getConfig } from "@/lib/config";
import type { Job, JobFile } from "@/lib/types";

const ATTACHMENTS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "relay-attachments")
  : path.join(process.cwd(), ".data", "attachments");
const MAX_INLINE_BYTES = 12 * 1024 * 1024;

export type CursorFilePayload = {
  name: string;
  mime?: string;
  size?: number;
  url?: string;
  content_base64?: string;
};

export function safeAttachmentName(name: string) {
  return name.replace(/[^\w.-]+/g, "_");
}

export async function resolveJobFileForCursor(
  job: Job,
  file: JobFile,
): Promise<CursorFilePayload> {
  if (file.url) {
    return resolveSlackFile(job, file);
  }
  const { telegramFileUrl } = await import("@/lib/telegram");
  return {
    name: file.name,
    mime: file.mime,
    size: file.size,
    url: await telegramFileUrl(file.fileId),
  };
}

async function downloadSlackFileBytes(job: Job, file: JobFile) {
  const {
    fetchSlackPrivateFile,
    getSlackFileDownloadTokens,
  } = await import("@/lib/slack");
  if (!file.url) throw new Error("Missing Slack file URL");

  const tokens = await getSlackFileDownloadTokens(job.slackTeamId);
  let lastStatus = 0;
  for (const token of tokens) {
    const response = await fetchSlackPrivateFile(file.url, token);
    lastStatus = response.status;
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
  }
  throw new Error(`Could not download ${file.name}: HTTP ${lastStatus}`);
}

async function cacheLocally(
  jobId: string,
  safeName: string,
  bytes: Buffer,
) {
  try {
    const dir = path.join(ATTACHMENTS_DIR, jobId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, safeName), bytes);
  } catch (error) {
    console.error(`[relay] local attachment cache failed for ${jobId}`, error);
  }
}

async function resolveSlackFile(job: Job, file: JobFile) {
  const { publicUrl } = getConfig();
  // Warm /tmp for same-isolate hits only — durability is Slack re-fetch on GET.
  const bytes = await downloadSlackFileBytes(job, file);
  const safeName = safeAttachmentName(file.name);
  await cacheLocally(job.id, safeName, bytes);

  if (publicUrl) {
    return {
      name: file.name,
      mime: file.mime,
      size: file.size ?? bytes.byteLength,
      url: `${publicUrl}/api/attachments/${job.id}/${encodeURIComponent(safeName)}`,
    };
  }

  if (bytes.byteLength > MAX_INLINE_BYTES) {
    throw new Error(
      `Slack attachment ${file.name} is too large to inline. Set PUBLIC_URL on Relay.`,
    );
  }

  return {
    name: file.name,
    mime: file.mime,
    size: bytes.byteLength,
    content_base64: bytes.toString("base64"),
  };
}

/**
 * Serve attachment bytes without growing Blob.
 * 1) same-isolate /tmp cache
 * 2) re-download from Slack using the job's stored private URL + bot token
 */
export async function loadAttachmentBytes(jobId: string, name: string) {
  const safeName = safeAttachmentName(decodeURIComponent(name));

  try {
    return await readFile(path.join(ATTACHMENTS_DIR, jobId, safeName));
  } catch {
    // continue
  }

  const { getJob } = await import("@/lib/jobs");
  const job = await getJob(jobId);
  const file = job?.files?.find(
    (item) => safeAttachmentName(item.name) === safeName && item.url,
  );
  if (!job || !file) return undefined;

  const bytes = await downloadSlackFileBytes(job, file);
  await cacheLocally(jobId, safeName, bytes);
  return bytes;
}

/** @deprecated use resolveJobFileForCursor */
export async function resolveJobFileUrl(job: Job, file: JobFile) {
  const payload = await resolveJobFileForCursor(job, file);
  if (payload.url) return payload.url;
  if (payload.content_base64) {
    return `data:${payload.mime ?? "application/octet-stream"};base64,${payload.content_base64.slice(0, 32)}…`;
  }
  throw new Error(`Could not resolve URL for ${file.name}`);
}

export function attachmentPath(jobId: string, name: string) {
  return path.join(ATTACHMENTS_DIR, jobId, safeAttachmentName(name));
}

export async function readCachedAttachment(jobId: string, name: string) {
  return readFile(attachmentPath(jobId, name));
}
