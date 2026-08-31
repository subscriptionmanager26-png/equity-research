export type DeliveryFile = {
  name: string;
  bytes: Uint8Array;
  mime?: string;
};

export type FormattedDelivery = {
  /** Inline message text (empty when the answer is sent as a file). */
  text: string;
  files: DeliveryFile[];
  /** When the body was moved into a markdown attachment. */
  usedMarkdownFile: boolean;
};

/** Answers at or below this length stay as chat text; longer ones become answer.md. */
export const INLINE_ANSWER_MAX_CHARS = 500;

const TEXT_ARTIFACT = /\.(md|markdown|txt)$/i;

function hasTextArtifact(files: DeliveryFile[]) {
  return files.some((file) => TEXT_ARTIFACT.test(file.name));
}

/**
 * Short answers stay as plain text. Long answers become a markdown file so Telegram
 * and Slack clients render them cleanly instead of dumping a wall of text.
 */
export function formatReplyForDelivery(
  message: string,
  existingFiles: DeliveryFile[] = [],
): FormattedDelivery {
  const trimmed = message.trim();
  const files = [...existingFiles];

  if (!trimmed) {
    return { text: "", files, usedMarkdownFile: false };
  }

  if (trimmed.length <= INLINE_ANSWER_MAX_CHARS) {
    return { text: trimmed, files, usedMarkdownFile: false };
  }

  if (hasTextArtifact(files)) {
    return { text: "", files, usedMarkdownFile: false };
  }

  files.unshift({
    name: "answer.md",
    bytes: new TextEncoder().encode(trimmed),
    mime: "text/markdown",
  });

  return { text: "", files, usedMarkdownFile: true };
}

export function markdownFileCaption(name: string) {
  return name.endsWith(".md") ? "Cursor answer" : undefined;
}
