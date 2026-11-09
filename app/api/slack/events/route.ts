import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { handleSlackEvent } from "@/lib/handle-slack";
import { markSlackEventProcessed } from "@/lib/jobs";
import { deactivateSlackInstall } from "@/lib/slack-install";
import { verifySlackSignature } from "@/lib/slack";
import type { SlackInboundEvent } from "@/lib/types";

/** Thin ingress: verify, claim, enqueue — Cursor work runs in /api/jobs/dispatch. */
export const maxDuration = 10;

export async function POST(request: Request) {
  const cfg = getConfig();
  const rawBody = await request.text();
  let payload: {
    type?: string;
    challenge?: string;
    team_id?: string;
    event?: SlackInboundEvent;
    event_id?: string;
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (cfg.slackSigningSecret) {
    const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
    const signature = request.headers.get("x-slack-signature") ?? "";
    if (
      !verifySlackSignature({
        signingSecret: cfg.slackSigningSecret,
        timestamp,
        rawBody,
        signature,
      })
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const teamId = payload.team_id;

  if (payload.event?.type === "app_uninstalled" && teamId) {
    await deactivateSlackInstall(teamId).catch((error) => {
      console.error("[relay] Slack app_uninstalled cleanup failed", error);
    });
    return NextResponse.json({ ok: true });
  }

  if (payload.event) {
    if (payload.event_id) {
      const fresh = await markSlackEventProcessed(payload.event_id);
      if (!fresh) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
    }
    const event = { ...payload.event, team: teamId ?? payload.event.team };
    console.info(
      `[relay] Slack event ${event.type} channel=${event.channel} channel_type=${event.channel_type ?? "unknown"} user=${event.user ?? "none"}`,
    );
    await handleSlackEvent(event, { teamId }).catch((error) => {
      console.error("[relay] Slack webhook event failed", error);
    });
  }

  return NextResponse.json({ ok: true });
}
