import { NextResponse } from "next/server";

import { continueAfterResponse } from "@/lib/after-response";
import { listJobs } from "@/lib/jobs";
import { pollSlackOnce } from "@/lib/slack-user-poller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const jobs = await listJobs();
  continueAfterResponse(async () => {
    await pollSlackOnce().catch((error) => {
      console.error("[relay] Slack poll after jobs failed", error);
    });
  });
  return NextResponse.json({ jobs });
}
