import { NextResponse } from "next/server";

import { pollDispatchedJobs } from "@/lib/cursor-poll";
import { timingSafeEqual } from "@/lib/relay";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(header, `Bearer ${secret}`);
}

/** Vercel Cron (or manual) backup when the status webhook is missed. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await pollDispatchedJobs();
  return NextResponse.json({ ok: true, ...result });
}
