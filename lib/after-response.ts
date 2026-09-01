import { after } from "next/server";

/** Keep work running after the HTTP response on Vercel; fall back to fire-and-forget locally. */
export function continueAfterResponse(work: () => Promise<void>) {
  const run = () =>
    work().catch((error) => {
      console.error("[relay] background delivery task failed", error);
    });

  try {
    after(run);
  } catch {
    void run();
  }
}
