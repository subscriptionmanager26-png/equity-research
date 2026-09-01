import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reportFilenameFor } from "./report-filename";
import type { Job } from "./types";

const baseJob: Pick<Job, "id" | "prompt"> = {
  id: "job_abc12345",
  prompt: "give me report on ITC",
};

describe("reportFilenameFor", () => {
  it("uses artifact name when not generic report.md", () => {
    assert.equal(
      reportFilenameFor(baseJob, "", [
        { name: "itc-equity-report.md", bytes: new Uint8Array() },
      ]),
      "itc-equity-report.md",
    );
  });

  it("derives filename from report heading", () => {
    assert.equal(
      reportFilenameFor(baseJob, "# ITC Equity Report\n\nBody"),
      "itc-equity-report.md",
    );
  });

  it("derives filename from prompt when heading missing", () => {
    assert.equal(
      reportFilenameFor(
        { id: "job_abc12345", prompt: "ITC stock analysis please" },
        "x".repeat(600),
      ),
      "itc-stock-analysis-report.md",
    );
  });

  it("falls back to job id suffix", () => {
    assert.equal(
      reportFilenameFor({ id: "job_deadbeef", prompt: "hi" }, "x".repeat(600)),
      "report-deadbeef.md",
    );
  });
});
