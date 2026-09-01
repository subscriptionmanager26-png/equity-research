import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findTelegramFollowUpJob } from "./jobs";
import type { Job } from "./types";

function job(partial: Partial<Job>): Job {
  return {
    id: "job_1",
    createdAt: "",
    updatedAt: "",
    source: "telegram",
    prompt: "hello",
    status: "replied",
    events: [],
    ...partial,
  };
}

describe("findTelegramFollowUpJob", () => {
  it("matches a reply to the delivered Cursor answer", () => {
    const parent = job({
      chatId: 1,
      cursorAgentId: "bc-abc",
      reply: {
        message: "hi",
        status: "finished",
        receivedAt: "",
        telegramMessageId: 99,
      },
    });
    assert.equal(findTelegramFollowUpJob([parent], 1, 99)?.id, "job_1");
  });

  it("matches a reply to the ack or the original user message", () => {
    const parent = job({
      chatId: 7,
      cursorAgentId: "bc-xyz",
      telegramAckMessageId: 11,
      telegramInboundMessageId: 10,
    });
    assert.equal(findTelegramFollowUpJob([parent], 7, 11)?.cursorAgentId, "bc-xyz");
    assert.equal(findTelegramFollowUpJob([parent], 7, 10)?.cursorAgentId, "bc-xyz");
    assert.equal(findTelegramFollowUpJob([parent], 7, 12), undefined);
    assert.equal(findTelegramFollowUpJob([parent], 8, 11), undefined);
  });
});
