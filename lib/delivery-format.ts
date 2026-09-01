import { userRequestedPdf } from "@/lib/automation-prompt";

export type DeliveryFile = {
  name: string;
  bytes: Uint8Array;
  mime?: string;
};

export type FormattedDelivery = {
  /** Short inline summary (never the full report when a file is attached). */
  text: string;
  files: DeliveryFile[];
  usedMarkdownFile: boolean;
};

export type FormatReplyOptions = {
  /** User explicitly asked for a PDF in the original prompt. */
  allowPdf?: boolean;
  /** Filename for synthesized markdown (default report.md). */
  reportFilename?: string;
};

/** Quick answers at or below this length stay as plain chat text. */
export const INLINE_ANSWER_MAX_CHARS = 500;

/** Max length for the inline summary when a report file is attached. */
export const SUMMARY_MAX_CHARS = 280;

const TEXT_ARTIFACT = /\.(md|markdown|txt)$/i;
const META_LINE =
  /^(full report|detailed report|report saved|see attached|attached:|artifacts\/)/i;

function hasTextArtifact(files: DeliveryFile[]) {
  return files.some((file) => TEXT_ARTIFACT.test(file.name));
}

function isPdf(file: DeliveryFile) {
  return /\.pdf$/i.test(file.name);
}

function filterFiles(files: DeliveryFile[], allowPdf: boolean) {
  if (allowPdf) return files;
  return files.filter((file) => !isPdf(file));
}

function truncate(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Pull a short chat summary from the agent's full answer. */
export function extractShortSummary(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return "";

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const withoutMeta = line
        .replace(/^#+\s*/, "")
        .replace(/^\*\*|\*\*$/g, "")
        .replace(/`/g, "")
        .trim();
      if (withoutMeta.length < 12) continue;
      if (META_LINE.test(withoutMeta)) continue;
      if (/^[-|]/.test(withoutMeta)) continue;
      return truncate(withoutMeta, SUMMARY_MAX_CHARS);
    }
  }

  return truncate(
    trimmed.replace(/^#+\s*/gm, "").replace(/\*\*/g, ""),
    SUMMARY_MAX_CHARS,
  );
}

function primaryMarkdownName(files: DeliveryFile[]) {
  const md = files.find((file) => TEXT_ARTIFACT.test(file.name));
  return md?.name ?? "report.md";
}

/**
 * Short answers → plain text.
 * Reports → report.md + a brief summary only (no full text, no PDF unless requested).
 */
export function formatReplyForDelivery(
  message: string,
  existingFiles: DeliveryFile[] = [],
  options: FormatReplyOptions = {},
): FormattedDelivery {
  const allowPdf = options.allowPdf ?? false;
  const trimmed = message.trim();
  const files = filterFiles([...existingFiles], allowPdf);

  const hasMd = hasTextArtifact(files);
  const isLong = trimmed.length > INLINE_ANSWER_MAX_CHARS;
  const reportMode = hasMd || isLong;

  if (!trimmed && files.length === 0) {
    return { text: "", files, usedMarkdownFile: false };
  }

  if (!reportMode) {
    return { text: trimmed, files, usedMarkdownFile: false };
  }

  let usedMarkdownFile = false;
  if (!hasMd && isLong) {
    const name = options.reportFilename ?? "report.md";
    files.unshift({
      name,
      bytes: new TextEncoder().encode(trimmed),
      mime: "text/markdown",
    });
    usedMarkdownFile = true;
  }

  const summary =
    extractShortSummary(trimmed) ||
    `Report attached: ${primaryMarkdownName(files)}`;

  return { text: summary, files, usedMarkdownFile };
}

export function formatReplyForJob(
  message: string,
  files: DeliveryFile[],
  jobPrompt?: string,
  reportFilename?: string,
) {
  return formatReplyForDelivery(message, files, {
    allowPdf: userRequestedPdf(jobPrompt ?? ""),
    reportFilename,
  });
}

export function markdownFileCaption(name: string) {
  return name.endsWith(".md") ? "Report" : undefined;
}
