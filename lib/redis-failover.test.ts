import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  clearRedisFailover,
  isRedisFailoverActive,
  isRedisUnavailableError,
  markRedisFailover,
  noteRedisError,
} from "./redis-failover";

describe("redis failover", () => {
  beforeEach(() => {
    clearRedisFailover();
  });

  it("detects Upstash quota errors", () => {
    assert.equal(
      isRedisUnavailableError(new Error("ERR max requests limit exceeded")),
      true,
    );
    assert.equal(
      isRedisUnavailableError(new Error("Something else")),
      false,
    );
  });

  it("activates failover on quota errors", () => {
    assert.equal(isRedisFailoverActive(), false);
    assert.equal(
      noteRedisError(new Error("ERR max requests limit exceeded")),
      true,
    );
    assert.equal(isRedisFailoverActive(), true);
  });

  it("ignores unrelated errors", () => {
    assert.equal(noteRedisError(new Error("job not found")), false);
    assert.equal(isRedisFailoverActive(), false);
  });

  it("markRedisFailover extends the window", () => {
    markRedisFailover("test", 60_000);
    assert.equal(isRedisFailoverActive(), true);
  });
});
