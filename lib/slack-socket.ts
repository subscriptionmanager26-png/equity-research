import { SocketModeClient } from "@slack/socket-mode";

import { getConfig } from "@/lib/config";
import { handleSlackEvent } from "@/lib/handle-slack";
import { markSlackEventProcessed } from "@/lib/jobs";
import { getSlackBotIdentity } from "@/lib/slack";
import type { SlackInboundEvent } from "@/lib/types";

declare global {
  var __relaySlackSocket: { started: boolean } | undefined;
}

export async function startSlackSocket() {
  if (globalThis.__relaySlackSocket?.started) return;
  const cfg = getConfig();
  if (!cfg.slackSocketConfigured) {
    if (cfg.slackBotConfigured) {
      console.info(
        "[relay] Slack Socket Mode skipped: set SLACK_APP_TOKEN to receive events",
      );
    }
    return;
  }

  globalThis.__relaySlackSocket = { started: true };

  try {
    const bot = await getSlackBotIdentity();
    const socket = new SocketModeClient({ appToken: cfg.slackAppToken! });
    socket.on("events_api", async ({ body, ack }) => {
      await ack();
      const envelope = body as {
        event_id?: string;
        event?: SlackInboundEvent;
      };
      if (!envelope.event) return;
      if (envelope.event_id) {
        const fresh = await markSlackEventProcessed(envelope.event_id);
        if (!fresh) return;
      }
      try {
        await handleSlackEvent(envelope.event);
      } catch (error) {
        console.error("[relay] Slack event handler failed", error);
      }
    });
    await socket.start();
    console.info(
      `[relay] Slack Socket Mode connected as ${bot.name ?? bot.userId}`,
    );
  } catch (error) {
    globalThis.__relaySlackSocket = { started: false };
    console.error("[relay] Slack Socket Mode failed to start", error);
  }
}
