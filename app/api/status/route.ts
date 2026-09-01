import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { publicStatus } from "@/lib/config";
import { getStore } from "@/lib/store";
import { replyUrl } from "@/lib/cursor";

export async function GET() {
  try {
    const store = await getStore();
    const status = publicStatus();
    return NextResponse.json({
      ...status,
      replyUrl: replyUrl(),
      slackEventsPath: "/api/slack/events",
      bot: store.bot
        ? {
            username: store.bot.username,
            name: store.bot.name,
          }
        : null,
      slackBot: store.slackBot
        ? {
            name: store.slackBot.name,
            userId: store.slackBot.userId,
          }
        : null,
      chats: store.chats.slice(0, 5).map((chat) => ({
        chatId: chat.chatId,
        username: chat.username,
        displayName: chat.displayName,
        lastMessageAt: chat.lastMessageAt,
      })),
      jobCount: store.jobs.length,
    });
  } catch (error) {
    console.error("[relay] /api/status store read failed", error);
    return NextResponse.json(
      { ...publicStatus(), storeError: "blob_unavailable" },
      { status: 200 },
    );
  }
}
