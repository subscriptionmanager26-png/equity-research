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

  it("ignores DM thread replies without @pocketedge", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "also compare with HDFC",
        ts: "2.0",
        thread_ts: "1.0",
        channelId: "D08DM",
        trackedThread: true,
      }),
      "ignore",
    );
  });

  it("treats a pocketedge reply in a tracked channel thread as a follow-up", () => {
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

  it("treats app_mention in a tracked thread as a follow-up", () => {
    assert.equal(
      classifySlackEvent({
        type: "app_mention",
        text: "@pocketedge compare returns",
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

  it("treats bare <@bot> channel messages as addressed when bot user id is known", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "<@U0BS6CUGZLP> analyze nvda",
        ts: "1.0",
        channelId: "C0CHANNEL",
        channelType: "channel",
        trackedThread: false,
      }),
      "ignore",
    );
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "<@U0BS6CUGZLP> analyze nvda",
        ts: "1.0",
        channelId: "C0CHANNEL",
        channelType: "channel",
        trackedThread: false,
        mentionUserId: "U0BS6CUGZLP",
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
        channelId: "C0CHANNEL",
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

  it("ignores plain pocketedge without an @mention", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "pocketedge what is RELIANCE?",
        ts: "1.0",
        channelId: "C0CHANNEL",
        channelType: "channel",
        trackedThread: false,
      }),
      "ignore",
    );
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "we should ask pocketedge about that later",
        ts: "2.0",
        channelId: "C0CHANNEL",
        channelType: "channel",
        trackedThread: false,
      }),
      "ignore",
    );
  });

  it("ignores untagged DMs", () => {
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "summarize NVDA earnings",
        ts: "1.0",
        channelId: "D0BOTDM",
        channelType: "im",
        trackedThread: false,
      }),
      "ignore",
    );
    assert.equal(
      classifySlackEvent({
        type: "message",
        text: "@pocketedge summarize NVDA earnings",
        ts: "1.0",
        channelId: "D0BOTDM",
        channelType: "im",
        trackedThread: false,
      }),
      "mention",
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
