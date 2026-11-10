import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  qstashConfigured,
  qstashToken,
  SETTLE_POLL_INTERVAL_SECONDS,
  SETTLE_POLL_MAX_ATTEMPTS,
} from "./qstash";

describe("qstash helpers", () => {
  it("reads QSTASH_TOKEN from the environment", () => {
    const prev = process.env.QSTASH_TOKEN;
    try {
      process.env.QSTASH_TOKEN = " test-token ";
      assert.equal(qstashToken(), "test-token");
      assert.equal(qstashConfigured(), true);
      delete process.env.QSTASH_TOKEN;
      assert.equal(qstashConfigured(), false);
    } finally {
      if (prev === undefined) delete process.env.QSTASH_TOKEN;
      else process.env.QSTASH_TOKEN = prev;
    }
  });

  it("settle backup is ~30s for ~5 minutes", () => {
    assert.equal(SETTLE_POLL_INTERVAL_SECONDS, 30);
    assert.equal(SETTLE_POLL_MAX_ATTEMPTS, 10);
    assert.equal(
      SETTLE_POLL_INTERVAL_SECONDS * SETTLE_POLL_MAX_ATTEMPTS,
      300,
    );
  });
});
