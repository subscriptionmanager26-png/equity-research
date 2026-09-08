import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { slackInboundDedupeKey } from "./slack-dedupe";

describe("slackInboundDedupeKey", () => {
  it("includes team id when present so Events API and poll share one key", () => {
    const key = slackInboundDedupeKey("C0CHANNEL", "123.456", "T0TEAM");
    assert.equal(key, "T0TEAM:C0CHANNEL:123.456");
  });

  it("falls back to channel:ts without team", () => {
    assert.equal(slackInboundDedupeKey("D0DM", "1.0"), "D0DM:1.0");
  });
});
