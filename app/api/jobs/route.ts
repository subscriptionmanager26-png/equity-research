import { NextResponse } from "next/server";

import { continueAfterResponse } from "@/lib/after-response";
import { listJobs } from "@/lib/jobs";
import { kickSlackMentionScan } from "@/lib/slack-user-poller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const jobs = await listJobs();
  continueAfterResponse(async () => {
    await kickSlackMentionScan();
  });
  return NextResponse.json({ jobs });
}
