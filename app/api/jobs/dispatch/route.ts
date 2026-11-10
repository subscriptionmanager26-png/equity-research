import { NextResponse } from "next/server";

import { getJob } from "@/lib/jobs";
import { acquireCursorSlot, releaseCursorSlot } from "@/lib/cursor-slots";
import { enqueueJobDispatch, verifyQStashRequest } from "@/lib/qstash";
import { completeJobDispatch } from "@/lib/relay";

/** Cursor create can take a while; settle is via status webhook + 30s QStash settle chain. */
export const maxDuration = 60;

type DispatchBody = { jobId?: string };

export async function POST(request: Request) {
  const rawBody = await request.text();
  const ok = await verifyQStashRequest(request, rawBody);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DispatchBody;
  try {
    body = JSON.parse(rawBody) as DispatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = body.jobId?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "job not found", jobId }, { status: 404 });
  }
  if (job.status === "dispatched" || job.status === "replied" || job.status === "delivering") {
    return NextResponse.json({ ok: true, skipped: true, status: job.status, jobId });
  }
  if (job.status === "error") {
    return NextResponse.json({ ok: true, skipped: true, status: "error", jobId });
  }

  const slot = await acquireCursorSlot();
  if (!slot.ok) {
    await enqueueJobDispatch(jobId, { delaySeconds: slot.retryAfterSeconds });
    return NextResponse.json({
      ok: true,
      deferred: true,
      retryAfterSeconds: slot.retryAfterSeconds,
      jobId,
    });
  }

  try {
    const updated = await completeJobDispatch(job);
    return NextResponse.json({
      ok: true,
      jobId: updated.id,
      status: updated.status,
      cursorAgentId: updated.cursorAgentId ?? null,
    });
  } finally {
    await releaseCursorSlot().catch(() => undefined);
  }
}
