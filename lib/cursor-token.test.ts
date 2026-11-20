import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  listCursorTokenSlots,
  orderCursorTokenSlots,
  resolveCursorToken,
  shouldFailoverCursorCreate,
  withCursorToken,
  getActiveCursorToken,
} from "./cursor-token";

describe("shouldFailoverCursorCreate", () => {
  it("failsover on auth and quota HTTP statuses", () => {
    for (const status of [401, 402, 403, 429]) {
      assert.equal(shouldFailoverCursorCreate(status, {}), true);
    }
    assert.equal(shouldFailoverCursorCreate(500, {}), false);
    assert.equal(shouldFailoverCursorCreate(400, {}), false);
  });

  it("failsover when the body mentions quota or payment limits", () => {
    assert.equal(
      shouldFailoverCursorCreate(500, { error: "spend limit exceeded" }),
      true,
    );
    assert.equal(
      shouldFailoverCursorCreate(503, { message: "usage limit reached" }),
      true,
    );
    assert.equal(shouldFailoverCursorCreate(503, { message: "upstream" }), false);
  });
});

describe("cursor token slots", () => {
  it("lists primary and alt when both env vars are set", () => {
    const prev = process.env.CURSOR_WEBHOOK_TOKEN;
    const prevAlt = process.env.CURSOR_WEBHOOK_TOKEN_ALT;
    process.env.CURSOR_WEBHOOK_TOKEN = "tok-primary";
    process.env.CURSOR_WEBHOOK_TOKEN_ALT = "tok-alt";
    try {
      assert.deepEqual(listCursorTokenSlots(), [
        { slot: "primary", token: "tok-primary" },
        { slot: "alt", token: "tok-alt" },
      ]);
      assert.equal(resolveCursorToken("alt").token, "tok-alt");
      assert.deepEqual(
        orderCursorTokenSlots("alt").map((entry) => entry.slot),
        ["alt", "primary"],
      );
    } finally {
      if (prev === undefined) delete process.env.CURSOR_WEBHOOK_TOKEN;
      else process.env.CURSOR_WEBHOOK_TOKEN = prev;
      if (prevAlt === undefined) delete process.env.CURSOR_WEBHOOK_TOKEN_ALT;
      else process.env.CURSOR_WEBHOOK_TOKEN_ALT = prevAlt;
    }
  });

  it("runs Cursor API helpers under the active token context", async () => {
    const prev = process.env.CURSOR_WEBHOOK_TOKEN;
    process.env.CURSOR_WEBHOOK_TOKEN = "tok-primary";
    try {
      assert.equal(getActiveCursorToken(), "tok-primary");
      await withCursorToken("tok-alt-runtime", async () => {
        assert.equal(getActiveCursorToken(), "tok-alt-runtime");
      });
      assert.equal(getActiveCursorToken(), "tok-primary");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_WEBHOOK_TOKEN;
      else process.env.CURSOR_WEBHOOK_TOKEN = prev;
    }
  });
});
