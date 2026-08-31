import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { listJobs } from "@/lib/jobs";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ jobs });
}
