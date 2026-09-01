import { NextResponse } from "next/server";

import { pollSlackOnce } from "@/lib/slack-user-poller";
import { timingSafeEqual } from "@/lib/relay";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(header, `Bearer ${secret}`);
}

/** Search Slack for @pocketedge using the user token (reply-as-you). */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await pollSlackOnce({ force: true });
  return NextResponse.json(result);
}
