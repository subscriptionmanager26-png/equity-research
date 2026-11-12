import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSlackFileDownloadTokens } from "./slack";

describe("getSlackFileDownloadTokens", () => {
  it("prefers bot token over user token for private downloads", async () => {
    const prevBot = process.env.SLACK_BOT_TOKEN;
    const prevUser = process.env.SLACK_USER_TOKEN;
    try {
      process.env.SLACK_BOT_TOKEN = "xoxb-bot";
      process.env.SLACK_USER_TOKEN = "xoxp-user";
      const tokens = await getSlackFileDownloadTokens();
      assert.deepEqual(tokens, ["xoxb-bot", "xoxp-user"]);
    } finally {
      if (prevBot === undefined) delete process.env.SLACK_BOT_TOKEN;
      else process.env.SLACK_BOT_TOKEN = prevBot;
      if (prevUser === undefined) delete process.env.SLACK_USER_TOKEN;
      else process.env.SLACK_USER_TOKEN = prevUser;
    }
  });
});
