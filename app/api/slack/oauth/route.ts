import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import {
  buildSlackAuthorizeUrl,
  createSlackOAuthState,
} from "@/lib/slack-oauth";

export async function GET() {
  const cfg = getConfig();
  if (!cfg.slackOAuthConfigured) {
    return NextResponse.json(
      {
        error:
          "Slack OAuth is not configured. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and PUBLIC_URL.",
      },
      { status: 503 },
    );
  }
  const state = await createSlackOAuthState();
  const url = buildSlackAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
