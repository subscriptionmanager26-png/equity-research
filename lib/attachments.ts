import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfig } from "@/lib/config";
import type { Job, JobFile } from "@/lib/types";

const ATTACHMENTS_DIR = path.join(process.cwd(), ".data", "attachments");

export async function resolveJobFileUrl(job: Job, file: JobFile) {
  if (file.url) {
    return cacheRemoteFile(job.id, file);
  }
  const { telegramFileUrl } = await import("@/lib/telegram");
  return telegramFileUrl(file.fileId);
}

async function cacheRemoteFile(jobId: string, file: JobFile) {
  const { publicUrl } = getConfig();
  const { getSlackAuthToken } = await import("@/lib/slack");
  const token = getSlackAuthToken();
  if (!file.url) throw new Error("Missing file URL");

  const dir = path.join(ATTACHMENTS_DIR, jobId);
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
    return `${publicUrl}/api/attachments/${jobId}/${encodeURIComponent(safeName)}`;
  }
  return `file://${target}`;
}

export function attachmentPath(jobId: string, name: string) {
  const safeName = name.replace(/[^\w.-]+/g, "_");
  return path.join(ATTACHMENTS_DIR, jobId, safeName);
}
