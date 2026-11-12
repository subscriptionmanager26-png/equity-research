import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeAttachmentName } from "./attachments";

describe("attachment naming", () => {
  it("sanitizes names for disk paths and API routes", () => {
    assert.equal(
      safeAttachmentName("10_01_2025_ TARIL.pdf"),
      "10_01_2025__TARIL.pdf",
    );
  });
});
