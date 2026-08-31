import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { publicStatus } from "@/lib/config";
import { getStore } from "@/lib/store";
import { replyUrl } from "@/lib/cursor";

export async function GET() {
  const store = await getStore();
  const status = publicStatus();
  return NextResponse.json({
    ...status,
    replyUrl: replyUrl(),
    bot: store.bot
      ? {
          username: store.bot.username,
          name: store.bot.name,
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
}
