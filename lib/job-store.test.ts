import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agentKey,
  capJobEvents,
  isTerminalJobStatus,
  jobKey,
  MAX_JOB_EVENTS,
} from "./job-store";
import type { Job } from "./types";

describe("job-store keys", () => {
  it("builds stable job and agent redis keys", () => {
    assert.equal(jobKey("job_abc"), "relay:job:job_abc");
    assert.equal(
      agentKey("bc_02c12d34-a45c-4c9b-a02a-66dc4709a22d"),
      "relay:agent:bc-02c12d34-a45c-4c9b-a02a-66dc4709a22d",
    );
    assert.equal(
      agentKey("bc-02c12d34-a45c-4c9b-a02a-66dc4709a22d"),
      "relay:agent:bc-02c12d34-a45c-4c9b-a02a-66dc4709a22d",
    );
  });
});

describe("job-store caps", () => {
  it("marks replied and error as terminal", () => {
    assert.equal(isTerminalJobStatus("replied"), true);
    assert.equal(isTerminalJobStatus("error"), true);
    assert.equal(isTerminalJobStatus("dispatched"), false);
    assert.equal(isTerminalJobStatus("queued"), false);
  });

  it("caps events to MAX_JOB_EVENTS", () => {
    const events = Array.from({ length: MAX_JOB_EVENTS + 5 }, (_, i) => ({
      at: new Date().toISOString(),
      type: `e${i}`,
      detail: `d${i}`,
    }));
    const job = {
      id: "job_1",
      events,
    } as Job;
    const capped = capJobEvents(job);
    assert.equal(capped.events.length, MAX_JOB_EVENTS);
    assert.equal(capped.events[0]?.type, "e0");
  });
});
