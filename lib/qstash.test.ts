import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LATE_WATCH_BACKOFF_SECONDS,
  LATE_WATCH_MAX_ATTEMPTS,
  lateWatchDelayForAttempt,
  qstashConfigured,
  qstashToken,
  SETTLE_BACKOFF_SECONDS,
  SETTLE_POLL_MAX_ATTEMPTS,
  settleDelayForAttempt,
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

  it("settle backup uses sparse exponential backoff", () => {
    assert.deepEqual([...SETTLE_BACKOFF_SECONDS], [60, 120, 300, 600, 1200]);
    assert.equal(SETTLE_POLL_MAX_ATTEMPTS, 5);
    assert.equal(settleDelayForAttempt(1), 60);
    assert.equal(settleDelayForAttempt(3), 300);
    assert.equal(settleDelayForAttempt(5), 1200);
  });

  it("late-watch backup covers multi-hour Listening reminds", () => {
    assert.deepEqual([...LATE_WATCH_BACKOFF_SECONDS], [300, 600, 1200, 2400, 3600]);
    assert.equal(LATE_WATCH_MAX_ATTEMPTS, 5);
    assert.equal(lateWatchDelayForAttempt(1), 300);
    assert.equal(lateWatchDelayForAttempt(5), 3600);
  });
});


