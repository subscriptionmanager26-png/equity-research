import { userRequestedPdf } from "@/lib/automation-prompt";
import {
  collectAgentFilesWithRetry,
  extractMentionedArtifactPaths,
} from "@/lib/artifact-collect";
import { addJobEvent, getJob } from "@/lib/jobs";
import { deliverReply } from "@/lib/relay";
import type { Job } from "@/lib/types";

export const MAX_ARTIFACT_FOLLOWUP_ATTEMPTS = 8;

/**
 * Cursor often publishes artifacts seconds after FINISHED.
 * Retry and send the file as a follow-up message. Safe on Vercel because
 * pendingArtifacts is stored and cron retries if this run is killed.
 */
export async function followUpArtifacts(
  jobId: string,
  agentId: string,
  assistantText: string,
  job: Job,
) {
  const current = (await getJob(jobId)) ?? job;
  if (!current || current.status !== "replied") return;
  const attempts = (current.pendingArtifacts?.attempts ?? 0) + 1;

  const files = await collectAgentFilesWithRetry(agentId, assistantText, {
    initialDelayMs: 0,
    attempts: 4,
    delayMs: 2500,
  }).catch(() => []);

  const allowPdf = userRequestedPdf(current.prompt ?? "");
  const deliverable = allowPdf
    ? files
    : files.filter((file) => !/\.pdf$/i.test(file.name));

  if (!deliverable.length) {
    const mentioned =
      current.pendingArtifacts?.mentionedPaths ??
      extractMentionedArtifactPaths(assistantText);
    if (attempts >= MAX_ARTIFACT_FOLLOWUP_ATTEMPTS) {
      console.warn(
        `[relay] Gave up on artifacts for ${agentId} after ${attempts} attempts`,
      );
      await addJobEvent(
        jobId,
        {
          type: "artifact_timeout",
          detail: mentioned.length
            ? `Cursor never published ${mentioned.join(", ")}`
            : "Cursor never published artifacts for this run",
        },
        { pendingArtifacts: undefined },
      );
      return;
    }
    await addJobEvent(
      jobId,
      {
        type: "artifact_retry",
        detail: `Artifact API still empty (attempt ${attempts})`,
      },
      {
        pendingArtifacts: {
          agentId,
          mentionedPaths: mentioned,
          attempts,
        },
      },
    );
    return;
  }

  await deliverReply({
    jobId,
    job: current,
    status: "finished",
    message: "",
    files: deliverable,
  });

  const names = deliverable.map((file) => file.name);
  await addJobEvent(
    jobId,
    {
      type: "artifact_delivered",
      detail: `Follow-up attached ${names.join(", ")}`,
    },
    {
      pendingArtifacts: undefined,
      reply: current.reply
        ? { ...current.reply, files: [...(current.reply.files ?? []), ...names] }
        : current.reply,
    },
  );

  console.info(
    `[relay] Artifact follow-up delivered ${names.join(", ")} for ${jobId}`,
  );
}
