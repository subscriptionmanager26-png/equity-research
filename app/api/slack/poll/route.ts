import { NextResponse } from "next/server";

import { continueAfterResponse } from "@/lib/after-response";
import { pollDispatchedJobs } from "@/lib/cursor-poll";
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

  continueAfterResponse(async () => {
    await pollDispatchedJobs({ maxMs: 20_000 }).catch((error) => {
      console.error("[relay] Cursor poll during Slack scan failed", error);
    });
  });

  return NextResponse.json({
    ...slack,
    note:
      "Manual poll only. Production ingress is Slack Events API at /api/slack/events.",
  });
}

export async function GET(request: Request) {
  return handlePoll(request);
}

export async function POST(request: Request) {
  return handlePoll(request);
}
