import { NextResponse } from "next/server";

import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = await listJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("[relay] /api/jobs store read failed", error);
    return NextResponse.json({ jobs: [], storeError: "blob_unavailable" }, { status: 503 });
  }
}
