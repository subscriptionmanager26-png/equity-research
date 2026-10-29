import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attachmentsRootDir } from "./attachments";

describe("attachmentsRootDir", () => {
  it("uses /tmp on Vercel", () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      assert.match(attachmentsRootDir(), /^\/tmp\/relay-attachments$/);
    } finally {
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
    }
  });
});
