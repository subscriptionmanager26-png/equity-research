import { NextResponse } from "next/server";

import { continueAfterResponse } from "@/lib/after-response";
import { pollDispatchedJobs } from "@/lib/cursor-poll";
import { timingSafeEqual } from "@/lib/relay";
import {
  pollSlackOnce,
  scheduleNextSlackPoll,
} from "@/lib/slack-user-poller";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(header, `Bearer ${secret}`);
}

/** Search Slack for @pocketedge about once a minute (self-chain on Vercel). */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const slack = await pollSlackOnce();

  continueAfterResponse(async () => {
    await scheduleNextSlackPoll(startedAt).catch((error) => {
      console.error("[relay] Slack poll chain failed", error);
    });
    await pollDispatchedJobs({ maxMs: 20_000 }).catch((error) => {
      console.error("[relay] Cursor poll during Slack scan failed", error);
    });
  });

  return NextResponse.json(slack);
}
