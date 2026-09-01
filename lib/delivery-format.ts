import { userRequestedPdf } from "@/lib/automation-prompt";

export type DeliveryFile = {
  name: string;
  bytes: Uint8Array;
  mime?: string;
};

export type FormattedDelivery = {
  text: string;
  files: DeliveryFile[];
};

function isPdf(file: DeliveryFile) {
  return /\.pdf$/i.test(file.name);
}

function filterFiles(files: DeliveryFile[], allowPdf: boolean) {
  if (allowPdf) return files;
  return files.filter((file) => !isPdf(file));
}

/** Relay agent output unchanged: final chat text plus any collected files. */
export function formatReplyForDelivery(
  message: string,
  existingFiles: DeliveryFile[] = [],
  options: { allowPdf?: boolean } = {},
): FormattedDelivery {
  const allowPdf = options.allowPdf ?? false;
  return {
    text: message.trim(),
    files: filterFiles([...existingFiles], allowPdf),
  };
}

export function formatReplyForJob(
  message: string,
  files: DeliveryFile[],
  jobPrompt?: string,
) {
  return formatReplyForDelivery(message, files, {
    allowPdf: userRequestedPdf(jobPrompt ?? ""),
  });
}

export function markdownFileCaption(name: string) {
  return name.endsWith(".md") ? "Report" : undefined;
}
