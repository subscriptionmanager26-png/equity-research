import crypto from "node:crypto";

import type { SlackWorkspaceInstall } from "@/lib/types";

const INSTALL_PREFIX = "relay:slack:install:";
const INSTALL_INDEX = "relay:slack:installs";

function encryptionKey() {
  const secret =
    process.env.SLACK_CLIENT_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!secret) {
    throw new Error("Set SLACK_CLIENT_SECRET or CRON_SECRET for install encryption");
  }
  return crypto.createHash("sha256").update(`${secret}:slack-install`).digest();
}

function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptToken(payload: string) {
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

async function redis() {
  const { getRedis } = await import("@/lib/store");
  return getRedis();
}

export async function saveSlackInstall(input: {
  teamId: string;
  teamName?: string;
  botToken: string;
  botUserId: string;
  installedByUserId?: string;
  scopes?: string[];
}) {
  const install: SlackWorkspaceInstall = {
    teamId: input.teamId,
    teamName: input.teamName,
    botTokenEnc: encryptToken(input.botToken),
    botUserId: input.botUserId,
    installedByUserId: input.installedByUserId,
    scopes: input.scopes ?? [],
    installedAt: new Date().toISOString(),
    isActive: true,
  };
  const client = await redis();
  await client.set(`${INSTALL_PREFIX}${input.teamId}`, install);
  await client.sadd(INSTALL_INDEX, input.teamId);
  return install;
}

export async function getSlackInstall(
  teamId: string,
): Promise<SlackWorkspaceInstall | undefined> {
  if (!teamId) return undefined;
  const client = await redis();
  const stored = await client.get<SlackWorkspaceInstall>(
    `${INSTALL_PREFIX}${teamId}`,
  );
  if (!stored || !stored.isActive) return undefined;
  return stored;
}

export async function getSlackInstallBotToken(teamId: string) {
  const install = await getSlackInstall(teamId);
  if (!install?.botTokenEnc) return undefined;
  return decryptToken(install.botTokenEnc);
}

export async function deactivateSlackInstall(teamId: string) {
  const client = await redis();
  const key = `${INSTALL_PREFIX}${teamId}`;
  const stored = await client.get<SlackWorkspaceInstall>(key);
  if (!stored) return;
  await client.set(key, {
    ...stored,
    isActive: false,
    botTokenEnc: "",
    uninstalledAt: new Date().toISOString(),
  });
  await client.srem(INSTALL_INDEX, teamId);
}

export async function listSlackInstalls() {
  const client = await redis();
  const teamIds = await client.smembers(INSTALL_INDEX);
  const installs: SlackWorkspaceInstall[] = [];
  for (const teamId of teamIds) {
    const install = await getSlackInstall(teamId);
    if (install) installs.push(install);
  }
  return installs;
}
