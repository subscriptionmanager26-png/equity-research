import { NextResponse } from "next/server";

import {
  deliverAgentLateUpdate,
  shouldWatchForLateDelivery,
} from "@/lib/cursor-late-delivery";
import { agentIdForJob } from "@/lib/cursor-settle";
import { getJob } from "@/lib/jobs";
import {
  enqueueJobLateWatch,
  LATE_WATCH_MAX_ATTEMPTS,
  lateWatchDelayForAttempt,
  verifyQStashRequest,
} from "@/lib/qstash";

export const maxDuration = 60;

type LateWatchBody = { jobId?: string; attempt?: number };

/**
 * Backup path for Cursor Listening / timed reminds after the ack was already
 * delivered to Slack. Primary path is the status webhook late-delivery branch.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const ok = await verifyQStashRequest(request, rawBody);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: LateWatchBody;
  try {
    body = JSON.parse(rawBody) as LateWatchBody;
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
  if (job.status !== "replied") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not_replied",
      jobId,
      status: job.status,
    });
  }

  const agentId = agentIdForJob(job);
  if (!agentId) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_agent",
      jobId,
    });
  }

  const result = await deliverAgentLateUpdate(jobId, agentId);

  const stillWatch =
    shouldWatchForLateDelivery({
      prompt: job.prompt,
      answer: job.reply?.message,
    }) || result.delivered;

  const nextAttempt = attempt + 1;
  if (stillWatch && nextAttempt <= LATE_WATCH_MAX_ATTEMPTS) {
    await enqueueJobLateWatch(jobId, nextAttempt).catch((error) => {
      console.error(`[relay] Failed to re-enqueue late-watch for ${jobId}`, error);
    });
  }

  return NextResponse.json({
    ok: true,
    jobId,
    attempt,
    delivered: result.delivered,
    reason: result.reason,
    nextAttempt:
      stillWatch && nextAttempt <= LATE_WATCH_MAX_ATTEMPTS ? nextAttempt : null,
    nextDelaySeconds:
      stillWatch && nextAttempt <= LATE_WATCH_MAX_ATTEMPTS
        ? lateWatchDelayForAttempt(nextAttempt)
        : null,
  });
}
