import os from "node:os";
import path from "node:path";

/** True on Vercel / AWS Lambda where only /tmp is writable. */
export function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV,
  );
}

/** Writable Relay data root (job store files, cached attachments). */
export function relayDataDir() {
  if (isServerlessRuntime()) {
    return path.join(os.tmpdir(), "relay");
  }
  return path.join(process.cwd(), ".data");
}
