import { NextResponse } from "next/server";

import { ingestJob } from "@/lib/relay";

/** Dashboard ingest only queues + enqueues QStash; dispatch is async. */
export const maxDuration = 10;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { text?: string }
    | null;
  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Send JSON { text: \"your message\" }" },
      { status: 400 },
    );
  }

  const job = await ingestJob({
    source: "dashboard",
    prompt: text,
  });
  return NextResponse.json({ job });
}
