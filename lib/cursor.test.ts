import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCloudAgentPrompt } from "./cursor";
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
