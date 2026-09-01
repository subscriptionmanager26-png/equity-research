import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agentIdForJob,
  findDispatchedJobForAgent,
  normalizeAgentId,
} from "./cursor-settle";
import type { Job } from "./types";

function job(overrides: Partial<Job> & Pick<Job, "id">): Job {
  return {
    source: "telegram",
    status: "dispatched",
    prompt: "test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
    ...overrides,
  };
}

describe("normalizeAgentId", () => {
  it("normalizes bc_ to bc-", () => {
    assert.equal(normalizeAgentId("bc_abc123"), "bc-abc123");
    assert.equal(normalizeAgentId("bc-abc123"), "bc-abc123");
  });
});

describe("findDispatchedJobForAgent", () => {
  it("matches by cursorAgentId across id formats", () => {
    const jobs = [
      job({
        id: "job_1",
        cursorAgentId: "bc-02c12d34-a45c-4c9b-a02a-66dc4709a22d",
      }),
      job({ id: "job_2", status: "replied" }),
    ];
    const found = findDispatchedJobForAgent(
      jobs,
      "bc_02c12d34-a45c-4c9b-a02a-66dc4709a22d",
    );
    assert.equal(found?.id, "job_1");
  });

  it("reads agent id from cursorBody", () => {
    const jobs = [
      job({
        id: "job_3",
        cursorBody: { backgroundComposerId: "bc-deadbeef" },
      }),
    ];
    assert.equal(agentIdForJob(jobs[0]!), "bc-deadbeef");
    assert.equal(findDispatchedJobForAgent(jobs, "bc-deadbeef")?.id, "job_3");
  });
});
