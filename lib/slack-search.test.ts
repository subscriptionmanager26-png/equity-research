import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSlackMentionSearchQuery,
  parseThreadTsFromPermalink,
  slackSearchAfterDate,
  slackThreadTsFromSearchMatch,
  slackTsInLookback,
} from "./slack-search";

describe("slack mention search", () => {
  it("scopes search to recent days and the trigger word", () => {
    const now = new Date("2026-09-02T15:00:00.000Z");
    assert.equal(slackSearchAfterDate(now), "2026-08-31");
    assert.equal(
      buildSlackMentionSearchQuery({
        triggerWord: "pocketedge",
        now,
      }),
      "(pocketedge OR @pocketedge) after:2026-08-31",
    );
    assert.equal(
      buildSlackMentionSearchQuery({
        triggerWord: "pocketedge",
        mentionUserId: "U08ABC",
        now,
      }),
      "(pocketedge OR @pocketedge OR <@U08ABC>) after:2026-08-31",
    );
  });

  it("accepts Slack timestamps inside the lookback window", () => {
    const nowSec = Date.parse("2026-09-02T15:00:00.000Z") / 1000;
    assert.equal(slackTsInLookback(String(nowSec - 3600), nowSec), true);
    assert.equal(slackTsInLookback(String(nowSec - 3 * 86400), nowSec), false);
    assert.equal(slackTsInLookback("bad", nowSec), false);
  });

  it("reads thread_ts from Slack search permalinks", () => {
    assert.equal(
      parseThreadTsFromPermalink(
        "https://example.slack.com/archives/C0/p1788371682220449?thread_ts=1788277171.885569&cid=C0",
      ),
      "1788277171.885569",
    );
    assert.equal(
      slackThreadTsFromSearchMatch({
        ts: "1788371682.220449",
        permalink:
          "https://example.slack.com/archives/C0/p1788371682220449?thread_ts=1788277171.885569",
      }),
      "1788277171.885569",
    );
  });
});
