import { userRequestedPdf } from "@/lib/automation-prompt";
import {
  collectAgentFilesWithRetry,
  extractMentionedArtifactPaths,
} from "@/lib/artifact-collect";
import { getJob } from "@/lib/jobs";
import { deliverReply } from "@/lib/relay";
import type { Job } from "@/lib/types";

/**
 * Cursor often publishes artifacts seconds after FINISHED.
 * Retry in the background and send the file as a follow-up message.
 */
export async function followUpArtifacts(
  jobId: string,
  agentId: string,
  assistantText: string,
  job: Job,
) {
  const paths = extractMentionedArtifactPaths(assistantText);
  if (!paths.length) return;

  const files = await collectAgentFilesWithRetry(agentId, assistantText, {
    initialDelayMs: 2000,
    attempts: 12,
    delayMs: 3000,
  }).catch(() => []);

  const allowPdf = userRequestedPdf(job.prompt ?? "");
  const deliverable = allowPdf
    ? files
    : files.filter((file) => !/\.pdf$/i.test(file.name));

  if (!deliverable.length) {
    console.warn(
      `[relay] Artifact follow-up found nothing for ${agentId}: ${paths.join(", ")}`,
    );
    return;
  }

  const current = await getJob(jobId);
  if (!current || current.status !== "replied") return;

  await deliverReply({
    jobId,
    job: current,
    status: "finished",
    message: "",
    files: deliverable,
  });

  console.info(
    `[relay] Artifact follow-up delivered ${deliverable.map((f) => f.name).join(", ")} for ${jobId}`,
  );
}
