import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractMentionedArtifactPaths,
  isConcreteArtifactPath,
} from "./artifact-collect";

describe("isConcreteArtifactPath", () => {
  it("rejects template and example paths", () => {
    assert.equal(isConcreteArtifactPath("artifacts/<topic>-report.md"), false);
    assert.equal(isConcreteArtifactPath("artifacts/-report.md"), false);
    assert.equal(isConcreteArtifactPath("artifacts/report.md"), false);
  });

  it("accepts real report paths", () => {
    assert.equal(
      isConcreteArtifactPath("artifacts/hdfcbank-equity-report.md"),
      true,
    );
  });
});

describe("extractMentionedArtifactPaths", () => {
  it("parses ARTIFACT line from assistant output", () => {
    const paths = extractMentionedArtifactPaths(
      "**ARTIFACT:** `artifacts/hdfcbank-equity-report.md`",
    );
    assert.deepEqual(paths, ["artifacts/hdfcbank-equity-report.md"]);
  });

  it("ignores bare filenames like package.json", () => {
    const paths = extractMentionedArtifactPaths(
      "checked out with package.json name telegram-agent-relay",
    );
    assert.deepEqual(paths, []);
  });
});
