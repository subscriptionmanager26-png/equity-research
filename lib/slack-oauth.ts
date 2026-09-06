import crypto from "node:crypto";

import { getConfig } from "@/lib/config";
import { saveSlackInstall } from "@/lib/slack-install";

const BOT_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "files:read",
  "files:write",
  "users:read",
  "reactions:write",
  "channels:read",
  "groups:read",
  "im:read",
].join(",");

const OAUTH_STATE_PREFIX = "relay:slack:oauth-state:";
const STATE_TTL_SEC = 600;

async function redis() {
  const { getRedis } = await import("@/lib/store");
  return getRedis();
}

export function slackOAuthRedirectUri() {
  const { publicUrl } = getConfig();
  if (!publicUrl) throw new Error("PUBLIC_URL is required for Slack OAuth");
  return `${publicUrl}/api/slack/oauth/callback`;
}

export async function createSlackOAuthState() {
  const state = crypto.randomBytes(24).toString("base64url");
  const client = await redis();
  await client.set(`${OAUTH_STATE_PREFIX}${state}`, "1", { ex: STATE_TTL_SEC });
  return state;
}

export async function verifySlackOAuthState(state: string) {
  const client = await redis();
  const key = `${OAUTH_STATE_PREFIX}${state}`;
  const ok = await client.get(key);
  if (!ok) return false;
  await client.del(key);
  return true;
}

export function buildSlackAuthorizeUrl(state: string) {
  const cfg = getConfig();
  if (!cfg.slackClientId) {
    throw new Error("SLACK_CLIENT_ID is not configured");
  }
  const params = new URLSearchParams({
    client_id: cfg.slackClientId,
    scope: BOT_SCOPES,
    redirect_uri: slackOAuthRedirectUri(),
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

type OAuthAccessResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id?: string; name?: string };
  bot_user_id?: string;
  authed_user?: { id?: string };
  scope?: string;
};

export async function exchangeSlackOAuthCode(code: string) {
  const cfg = getConfig();
  if (!cfg.slackClientId || !cfg.slackClientSecret) {
    throw new Error("SLACK_CLIENT_ID and SLACK_CLIENT_SECRET are required");
  }
  const body = new URLSearchParams({
    client_id: cfg.slackClientId,
    client_secret: cfg.slackClientSecret,
    code,
    redirect_uri: slackOAuthRedirectUri(),
  });
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as OAuthAccessResponse;
  if (!data.ok || !data.access_token || !data.team?.id || !data.bot_user_id) {
    throw new Error(data.error ?? "Slack OAuth token exchange failed");
  }
  await saveSlackInstall({
    teamId: data.team.id,
    teamName: data.team.name,
    botToken: data.access_token,
    botUserId: data.bot_user_id,
    installedByUserId: data.authed_user?.id,
    scopes: data.scope?.split(",").filter(Boolean) ?? [],
  });
  return {
    teamId: data.team.id,
    teamName: data.team.name,
    botUserId: data.bot_user_id,
  };
}
