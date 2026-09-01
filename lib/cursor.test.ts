import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCloudAgentPrompt, cloudAgentModelSelection } from "./cursor";
import type { Job } from "./types";

function job(overrides: Partial<Job> = {}): Job {
  const now = new Date().toISOString();
  return {
    id: "job_test",
    source: "telegram",
    status: "queued",
    prompt: "HDFC Bank equity report",
    createdAt: now,
    updatedAt: now,
    events: [],
    ...overrides,
  };
}

describe("buildCloudAgentPrompt", () => {
  it("embeds the financial skill instructions and the user question", () => {
    const text = buildCloudAgentPrompt(job(), []);
    assert.match(text, /financial-analysis/);
    assert.match(text, /HDFC Bank equity report/);
    assert.match(text, /artifacts\/<topic>-report\.md/);
  });

  it("lists downloadable file URLs", () => {
    const text = buildCloudAgentPrompt(job(), [
      { name: "notes.md", url: "https://example.com/notes.md" },
    ]);
    assert.match(text, /notes\.md: https:\/\/example.com\/notes\.md/);
  });
});

describe("cloudAgentModelSelection", () => {
  it("reads id and params from env", () => {
    const prevModel = process.env.CURSOR_AGENT_MODEL;
    const prevParams = process.env.CURSOR_AGENT_MODEL_PARAMS;
    process.env.CURSOR_AGENT_MODEL = "grok-4.6";
    process.env.CURSOR_AGENT_MODEL_PARAMS = "effort=high,fast=false";
    try {
      assert.deepEqual(cloudAgentModelSelection(), {
        id: "grok-4.6",
        params: [
          { id: "effort", value: "high" },
          { id: "fast", value: "false" },
        ],
      });
    } finally {
      if (prevModel === undefined) delete process.env.CURSOR_AGENT_MODEL;
      else process.env.CURSOR_AGENT_MODEL = prevModel;
      if (prevParams === undefined) delete process.env.CURSOR_AGENT_MODEL_PARAMS;
      else process.env.CURSOR_AGENT_MODEL_PARAMS = prevParams;
    }
  });
});
