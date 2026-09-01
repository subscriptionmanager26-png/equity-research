import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifySlackEvent } from "./handle-slack";
import { findSlackThreadJob } from "./jobs";
import type { Job } from "./types";

describe("classifySlackEvent", () => {
  it("ignores channel thread chatter that does not mention pocketedge", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "sharing this for the group",
        ts: "2.0",
        thread_ts: "1.0",
        channelId: "C0CHANNEL",
        trackedThread: true,
      }),
      "ignore",
    );
  });

  it("treats a DM thread reply as a follow-up even without pocketedge", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "also compare with HDFC",
        ts: "2.0",
        thread_ts: "1.0",
        channelId: "D08DM",
        trackedThread: true,
      }),
      "follow_up",
    );
  });

  it("treats a pocketedge reply in a tracked channel thread as a follow-up, not a new job", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "@pocketedge go deeper on NIM",
        ts: "2.0",
        thread_ts: "1.0",
        channelId: "C0CHANNEL",
        trackedThread: true,
      }),
      "follow_up",
    );
  });

  it("treats a Slack app_mention as a trigger even if the word pocketedge is stripped", () => {
    assert.equal(
      classifySlackEvent({
        type: "app_mention",
        text: "<@U0BOT> make a report",
        ts: "1.0",
        trackedThread: false,
      }),
      "mention",
    );
  });

  it("starts a new job only for pocketedge outside a tracked thread", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "@pocketedge hello",
        ts: "1.0",
        trackedThread: false,
      }),
      "mention",
    );
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "hello",
        ts: "2.0",
        thread_ts: "1.0",
        trackedThread: false,
      }),
      "ignore",
    );
  });

  it("ignores Relay's own posted answers", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "Hello — doing well",
        ts: "2.0",
        thread_ts: "1.0",
        trackedThread: true,
        relayOutbound: true,
      }),
      "ignore",
    );
  });
});

describe("findSlackThreadJob", () => {
  it("matches the Cursor agent for a Slack thread", () => {
    const jobs: Job[] = [
      {
        id: "job_1",
        createdAt: "",
        updatedAt: "",
        source: "slack",
        prompt: "hello",
        status: "replied",
        events: [],
        slackChannelId: "D1",
        slackThreadTs: "1.0",
        cursorAgentId: "bc-abc",
      },
    ];
    assert.equal(findSlackThreadJob(jobs, "D1", "1.0")?.cursorAgentId, "bc-abc");
    assert.equal(findSlackThreadJob(jobs, "D1", "9.0"), undefined);
  });
});
