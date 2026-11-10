import { NextResponse } from "next/server";

import { settleDispatchedJob } from "@/lib/cursor-poll";
import { getJob } from "@/lib/jobs";
import {
  enqueueJobSettle,
  SETTLE_POLL_MAX_ATTEMPTS,
  settleDelayForAttempt,
  verifyQStashRequest,
} from "@/lib/qstash";

export const maxDuration = 60;

type SettleBody = { jobId?: string; attempt?: number };

/**
 * Per-job settle backup after dispatch.
 * Cursor status webhook is primary; this only catches missed webhooks via
 * a sparse exponential backoff chain (not a fixed poll tick).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const ok = await verifyQStashRequest(request, rawBody);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SettleBody;
  try {
    body = JSON.parse(rawBody) as SettleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = body.jobId?.trim();
  const attempt = Number(body.attempt ?? 1);
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  if (!Number.isFinite(attempt) || attempt < 1) {
    return NextResponse.json({ error: "invalid attempt" }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not_found", jobId });
  }

  let result;
  try {
    result = await settleDispatchedJob(job);
  } catch (error) {
    console.error(`[relay] settle ${jobId} attempt ${attempt} failed`, error);
    result = { status: "waiting" as const };
  }

  if (result.status === "settled") {
    return NextResponse.json({
      ok: true,
      jobId,
      attempt,
      status: "settled",
      artifactFollowUp: result.artifactFollowUp,
    });
  }

  if (result.status === "skipped") {
    return NextResponse.json({
      ok: true,
      jobId,
      attempt,
      status: "skipped",
      reason: result.reason,
    });
  }

  const nextAttempt = attempt + 1;
  if (nextAttempt <= SETTLE_POLL_MAX_ATTEMPTS) {
    await enqueueJobSettle(jobId, nextAttempt).catch((error) => {
      console.error(`[relay] Failed to re-enqueue settle for ${jobId}`, error);
    });
  }

  return NextResponse.json({
    ok: true,
    jobId,
    attempt,
    status: "waiting",
    nextAttempt:
      nextAttempt <= SETTLE_POLL_MAX_ATTEMPTS ? nextAttempt : null,
    nextDelaySeconds:
      nextAttempt <= SETTLE_POLL_MAX_ATTEMPTS
        ? settleDelayForAttempt(nextAttempt)
        : null,
  });
}
