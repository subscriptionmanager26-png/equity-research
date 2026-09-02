import { NextResponse } from "next/server";

import { listJobs } from "@/lib/jobs";
import { maybeStartSlackPollChain } from "@/lib/slack-user-poller";

export const dynamic = "force-dynamic";

export async function GET() {
  void maybeStartSlackPollChain().catch((error) => {
    console.error("[relay] Slack poll chain start from jobs failed", error);
  });
  try {
    const jobs = await listJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("[relay] /api/jobs store read failed", error);
    return NextResponse.json({ jobs: [], storeError: "blob_unavailable" }, { status: 503 });
  }
}
