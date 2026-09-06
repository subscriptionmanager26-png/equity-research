import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { publicStatus } from "@/lib/config";
import { getStore } from "@/lib/store";
import { replyUrl } from "@/lib/cursor";
import { maybeStartSlackPollChain } from "@/lib/slack-user-poller";
import { listSlackInstalls } from "@/lib/slack-install";

export async function GET() {
  void maybeStartSlackPollChain().catch((error) => {
    console.error("[relay] Slack poll chain start from status failed", error);
  });
  try {
    const store = await getStore();
    const status = publicStatus();
    const slackInstalls = await listSlackInstalls().catch(() => []);
    return NextResponse.json({
      ...status,
      replyUrl: replyUrl(),
      slackInstallCount: slackInstalls.length,
      slackInstalls: slackInstalls.map((install) => ({
        teamId: install.teamId,
        teamName: install.teamName,
        installedAt: install.installedAt,
      })),
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
      slackLastPollAt: store.slackLastPollAt ?? null,
      slackPollNextScheduledAt: store.slackPollNextScheduledAt ?? null,
    });
  } catch (error) {
    console.error("[relay] /api/status store read failed", error);
    return NextResponse.json(
      { ...publicStatus(), storeError: "blob_unavailable" },
      { status: 200 },
    );
  }
}
