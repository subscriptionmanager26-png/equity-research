import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getConfig } from "@/lib/config";
import type { Job, JobFile } from "@/lib/types";

const ATTACHMENTS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "relay-attachments")
  : path.join(process.cwd(), ".data", "attachments");
const MAX_INLINE_BYTES = 12 * 1024 * 1024;
const ATTACH_BLOB_PREFIX = "relay-attachments/";

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

export function attachmentBlobPath(jobId: string, name: string) {
  return `${ATTACH_BLOB_PREFIX}${jobId}/${safeAttachmentName(name)}`;
}

function blobTokenPresent() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
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

async function persistAttachmentBytes(
  jobId: string,
  safeName: string,
  bytes: Buffer,
  mime?: string,
) {
  const dir = path.join(ATTACHMENTS_DIR, jobId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), bytes);

  if (!blobTokenPresent()) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(attachmentBlobPath(jobId, safeName), bytes, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: mime || "application/octet-stream",
      cacheControlMaxAge: 60 * 60 * 24,
    });
  } catch (error) {
    console.error(`[relay] Blob persist failed for ${jobId}/${safeName}`, error);
  }
}

async function readAttachmentFromBlob(jobId: string, safeName: string) {
  if (!blobTokenPresent()) return undefined;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(attachmentBlobPath(jobId, safeName), {
      access: "private",
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return undefined;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  } catch (error) {
    console.error(`[relay] Blob read failed for ${jobId}/${safeName}`, error);
    return undefined;
  }
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

async function resolveSlackFile(job: Job, file: JobFile) {
  const { publicUrl } = getConfig();
  const bytes = await downloadSlackFileBytes(job, file);
  const safeName = safeAttachmentName(file.name);
  await persistAttachmentBytes(job.id, safeName, bytes, file.mime);

  // Prefer a durable Relay URL. /tmp alone dies across Vercel isolates — Blob
  // (and Slack re-download fallback) keep /api/attachments working for Cursor.
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

/** Load attachment bytes for /api/attachments — local, Blob, then Slack. */
export async function loadAttachmentBytes(jobId: string, name: string) {
  const safeName = safeAttachmentName(decodeURIComponent(name));

  try {
    return await readFile(path.join(ATTACHMENTS_DIR, jobId, safeName));
  } catch {
    // continue
  }

  const fromBlob = await readAttachmentFromBlob(jobId, safeName);
  if (fromBlob) {
    await mkdir(path.join(ATTACHMENTS_DIR, jobId), { recursive: true }).catch(
      () => undefined,
    );
    await writeFile(path.join(ATTACHMENTS_DIR, jobId, safeName), fromBlob).catch(
      () => undefined,
    );
    return fromBlob;
  }

  const { getJob } = await import("@/lib/jobs");
  const job = await getJob(jobId);
  const file = job?.files?.find(
    (item) => safeAttachmentName(item.name) === safeName && item.url,
  );
  if (!job || !file) return undefined;

  const bytes = await downloadSlackFileBytes(job, file);
  await persistAttachmentBytes(jobId, safeName, bytes, file.mime);
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
