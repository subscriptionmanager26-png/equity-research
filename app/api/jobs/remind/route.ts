import { NextResponse } from "next/server";

import { addJobEvent, getJob } from "@/lib/jobs";
import { verifyQStashRequest } from "@/lib/qstash";
import { deliverReply, deliveryDetail } from "@/lib/relay";
import {
  parseTimedReminder,
  reminderFireText,
} from "@/lib/reminders";

export const maxDuration = 30;

type RemindBody = { jobId?: string; task?: string };

/** QStash-delayed reminder ping for Relay-owned timed reminds. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const ok = await verifyQStashRequest(request, rawBody);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RemindBody;
  try {
    body = JSON.parse(rawBody) as RemindBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = body.jobId?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not_found", jobId });
  }

  const parsed = parseTimedReminder(job.prompt);
  const reminder = parsed
    ? {
        ...parsed,
        task: body.task?.trim() || parsed.task,
      }
    : body.task?.trim()
      ? {
          delaySeconds: 0,
          task: body.task.trim(),
          label: "",
        }
      : null;

  if (!reminder) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not_a_reminder",
      jobId,
    });
  }

  const message = reminderFireText(reminder);
  const delivery = await deliverReply({
    jobId,
    job,
    status: "finished",
    message,
    files: [],
  });

  await addJobEvent(
    jobId,
    {
      type: "remind_delivered",
      detail: deliveryDetail(job, delivery),
    },
    {
      status: "replied",
      reply: {
        message,
        status: "remind_delivered",
        receivedAt: new Date().toISOString(),
        telegramMessageId:
          delivery.telegramMessageId ?? job.reply?.telegramMessageId,
        slackMessageTs: delivery.slackMessageTs ?? job.reply?.slackMessageTs,
        files: job.reply?.files,
      },
    },
  );

  return NextResponse.json({
    ok: true,
    jobId,
    delivered: true,
    task: reminder.task,
  });
}
