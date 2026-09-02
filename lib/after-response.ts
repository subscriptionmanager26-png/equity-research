import { waitUntil } from "@vercel/functions";
import { after } from "next/server";

/** Keep work running after the HTTP response on Vercel; fall back to fire-and-forget locally. */
export function continueAfterResponse(work: () => Promise<void>) {
  const promise = work().catch((error) => {
    console.error("[relay] background delivery task failed", error);
  });

  try {
    waitUntil(promise);
    return;
  } catch {
    // waitUntil throws off Vercel; Next after() can hold the response if
    // it is given a long-running returned promise, so do not await it.
  }

  try {
    after(() => {
      void promise;
    });
  } catch {
    void promise;
  }
}
