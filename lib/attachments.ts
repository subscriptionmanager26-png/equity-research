import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfig } from "@/lib/config";
import type { Job, JobFile } from "@/lib/types";

const ATTACHMENTS_DIR = path.join(process.cwd(), ".data", "attachments");
const MAX_INLINE_BYTES = 12 * 1024 * 1024;

export type CursorFilePayload = {
  name: string;
  mime?: string;
  size?: number;
  url?: string;
  content_base64?: string;
};

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

async function resolveSlackFile(job: Job, file: JobFile) {
  const { publicUrl } = getConfig();
  const { getSlackAuthToken } = await import("@/lib/slack");
  const token = getSlackAuthToken();
  if (!file.url) throw new Error("Missing Slack file URL");

  const dir = path.join(ATTACHMENTS_DIR, job.id);
  await mkdir(dir, { recursive: true });
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const target = path.join(dir, safeName);

  const response = await fetch(file.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Could not download ${file.name}: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);

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
  const safeName = name.replace(/[^\w.-]+/g, "_");
  return path.join(ATTACHMENTS_DIR, jobId, safeName);
}

export async function readCachedAttachment(jobId: string, name: string) {
  return readFile(attachmentPath(jobId, name));
}
