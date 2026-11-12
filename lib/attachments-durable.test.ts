import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attachmentBlobPath, safeAttachmentName } from "./attachments";

describe("attachment naming", () => {
  it("sanitizes names for blob + disk paths", () => {
    assert.equal(
      safeAttachmentName("10_01_2025_ TARIL.pdf"),
      "10_01_2025__TARIL.pdf",
    );
    assert.equal(
      attachmentBlobPath("job_abc", "10_01_2025_ TARIL.pdf"),
      "relay-attachments/job_abc/10_01_2025__TARIL.pdf",
    );
  });
});
