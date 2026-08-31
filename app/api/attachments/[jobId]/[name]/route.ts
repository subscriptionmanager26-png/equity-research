import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { attachmentPath } from "@/lib/attachments";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string; name: string }> },
) {
  const { jobId, name } = await context.params;
  if (!jobId.startsWith("job_")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const bytes = await readFile(attachmentPath(jobId, decodeURIComponent(name)));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
