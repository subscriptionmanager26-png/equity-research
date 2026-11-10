import { NextResponse } from "next/server";

import { listJobs } from "@/lib/jobs";
import { DASHBOARD_JOB_LIMIT } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const raw = Number(url.searchParams.get("limit") ?? DASHBOARD_JOB_LIMIT);
    const limit =
      Number.isFinite(raw) && raw > 0
        ? Math.min(Math.floor(raw), DASHBOARD_JOB_LIMIT)
        : DASHBOARD_JOB_LIMIT;
    const jobs = await listJobs(limit);
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("[relay] /api/jobs store read failed", error);
    return NextResponse.json(
      { jobs: [], storeError: "redis_unavailable" },
      { status: 503 },
    );
  }
}
