import { NextResponse } from "next/server";

import { ingestAndDispatch } from "@/lib/relay";

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

  const job = await ingestAndDispatch({
    source: "dashboard",
    prompt: text,
  });
  return NextResponse.json({ job });
}
