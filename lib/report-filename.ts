import type { Job } from "@/lib/types";

import type { DeliveryFile } from "@/lib/delivery-format";

const TEXT_ARTIFACT = /\.(md|markdown|txt)$/i;

/** Pick a unique, human-readable markdown filename for this job. */
export function reportFilenameFor(
  job: Pick<Job, "id" | "prompt">,
  message: string,
  existingFiles: DeliveryFile[] = [],
): string {
  const fromArtifact = existingFiles.find((file) => TEXT_ARTIFACT.test(file.name));
  if (fromArtifact && fromArtifact.name !== "report.md") {
    return sanitizeFilename(fromArtifact.name);
  }

  const fromMention = message.match(
    /`?(artifacts\/[\w./-]+\.(?:md|markdown))`?/i,
  )?.[1];
  if (fromMention) {
    const name = fromMention.split("/").pop();
    if (name && name !== "report.md") return sanitizeFilename(name);
  }

  const heading = message.match(/^#{1,2}\s+(.+)$/m)?.[1];
  if (heading) {
    const slug = slugify(heading);
    if (slug.length >= 4) return `${slug}.md`;
  }

  const promptSlug = slugify(
    (job.prompt ?? "")
      .replace(/@\w+/g, "")
      .replace(/\b(pocketedge|share|give me|please|report on|equity report)\b/gi, "")
      .trim()
      .slice(0, 60),
  );
  if (promptSlug.length >= 4) return `${promptSlug}-report.md`;

  return `report-${job.id.replace(/^job_/, "").slice(0, 8)}.md`;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "") || "report.md";
}
