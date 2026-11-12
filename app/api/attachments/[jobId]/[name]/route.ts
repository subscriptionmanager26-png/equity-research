import { NextResponse } from "next/server";

import { loadAttachmentBytes, safeAttachmentName } from "@/lib/attachments";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string; name: string }> },
) {
  const { jobId, name } = await context.params;
  if (!jobId.startsWith("job_")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const bytes = await loadAttachmentBytes(jobId, name);
    if (!bytes) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const filename = safeAttachmentName(decodeURIComponent(name));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error(`[relay] attachment GET ${jobId}/${name} failed`, error);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
