import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractAgentId, parseArtifactList } from "./cursor-api";

describe("extractAgentId", () => {
  it("normalizes bc_ ids from webhook payloads", () => {
    assert.equal(
      extractAgentId({ id: "bc_02c12d34-a45c-4c9b-a02a-66dc4709a22d" }),
      "bc-02c12d34-a45c-4c9b-a02a-66dc4709a22d",
    );
  });

  it("reads nested automation responses", () => {
    assert.equal(
      extractAgentId({ data: { backgroundComposerId: "bc-deadbeef" } }),
      "bc-deadbeef",
    );
  });
});

describe("parseArtifactList", () => {
  it("accepts v1 items and v0 artifacts keys", () => {
    assert.deepEqual(
      parseArtifactList({
        items: [{ path: "artifacts/hdfc-equity-report.md", sizeBytes: 12 }],
      }),
      [{ path: "artifacts/hdfc-equity-report.md", sizeBytes: 12 }],
    );
    assert.equal(
      parseArtifactList({
        artifacts: [{ absolutePath: "/opt/cursor/artifacts/gold-report.md" }],
      })[0]?.path,
      "/opt/cursor/artifacts/gold-report.md",
    );
  });
});
