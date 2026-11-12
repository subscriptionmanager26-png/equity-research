import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findRepliedJobForAgent,
  isNewAssistantDelivery,
  shouldWatchForLateDelivery,
} from "./cursor-late-delivery";
import type { Job } from "./types";

function job(overrides: Partial<Job> & Pick<Job, "id">): Job {
  return {
    source: "slack",
    status: "replied",
    prompt: "test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
    ...overrides,
  };
}

describe("isNewAssistantDelivery", () => {
  it("detects a newer reminder ping after the ack", () => {
    assert.equal(
      isNewAssistantDelivery(
        "Reminder: close your laptop.",
        "I’ll ping you in 5 minutes to close your laptop.",
      ),
      true,
    );
  });

  it("skips identical text", () => {
    assert.equal(
      isNewAssistantDelivery("Same note", "Same   note"),
      false,
    );
  });
});

describe("shouldWatchForLateDelivery", () => {
  it("watches remind-me prompts", () => {
    assert.equal(
      shouldWatchForLateDelivery({
        prompt: "Can you remind me in 5 minutes to close my laptop.",
      }),
      true,
    );
  });

  it("ignores ordinary research finishes", () => {
    assert.equal(
      shouldWatchForLateDelivery({
        prompt: "analyze NVDA",
        answer: "NVDA looks extended near-term.",
        agentStatus: "FINISHED",
      }),
      false,
    );
  });
});

describe("findRepliedJobForAgent", () => {
  it("returns the newest replied slack job for the agent", () => {
    const jobs = [
      job({
        id: "old",
        cursorAgentId: "bc-abc",
        updatedAt: "2026-11-11T15:00:00.000Z",
      }),
      job({
        id: "new",
        cursorAgentId: "bc-abc",
        updatedAt: "2026-11-11T16:00:00.000Z",
      }),
      job({
        id: "other",
        cursorAgentId: "bc-zzz",
        updatedAt: "2026-11-11T17:00:00.000Z",
      }),
      job({
        id: "open",
        status: "dispatched",
        cursorAgentId: "bc-abc",
        updatedAt: "2026-11-11T18:00:00.000Z",
      }),
    ];
    assert.equal(findRepliedJobForAgent(jobs, "bc_abc")?.id, "new");
  });
});
