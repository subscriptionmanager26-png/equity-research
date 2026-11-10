import { NextResponse } from "next/server";

import { timingSafeEqual } from "@/lib/relay";
import { pollSlackOnce } from "@/lib/slack-user-poller";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(header, `Bearer ${secret}`);
}

/** Manual Slack scan for post-downtime catch-up (protected by CRON_SECRET). */
async function handlePoll(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const slack = await pollSlackOnce({ force });

  return NextResponse.json({
    ...slack,
    note:
      "Manual poll only. Production ingress is Slack Events API at /api/slack/events. Cursor settle is webhook + per-job 30s QStash chain.",
  });
}

export async function GET(request: Request) {
  return handlePoll(request);
}

export async function POST(request: Request) {
  return handlePoll(request);
}
