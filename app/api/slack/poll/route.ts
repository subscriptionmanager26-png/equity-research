import { NextResponse } from "next/server";

import { pollSlackOnce, scheduleNextSlackMentionScan } from "@/lib/slack-user-poller";
import { timingSafeEqual } from "@/lib/relay";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(header, `Bearer ${secret}`);
}

/** Search Slack (user token) for @pocketedge in any channel you can read. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await pollSlackOnce();
  if (!("skipped" in result && result.skipped)) {
    scheduleNextSlackMentionScan();
  }
  return NextResponse.json(result);
}
