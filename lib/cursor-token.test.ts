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
  it("lists primary and saffronai when both env vars are set", () => {
    const prev = process.env.CURSOR_WEBHOOK_TOKEN;
    const prevSaffron = process.env.Cursor_webhook_token_saffronai;
    process.env.CURSOR_WEBHOOK_TOKEN = "tok-primary";
    process.env.Cursor_webhook_token_saffronai = "tok-saffronai";
    try {
      assert.deepEqual(listCursorTokenSlots(), [
        { slot: "primary", token: "tok-primary" },
        { slot: "saffronai", token: "tok-saffronai" },
      ]);
      assert.equal(resolveCursorToken("saffronai").token, "tok-saffronai");
      assert.deepEqual(
        orderCursorTokenSlots("saffronai").map((entry) => entry.slot),
        ["saffronai", "primary"],
      );
    } finally {
      if (prev === undefined) delete process.env.CURSOR_WEBHOOK_TOKEN;
      else process.env.CURSOR_WEBHOOK_TOKEN = prev;
      if (prevSaffron === undefined) {
        delete process.env.Cursor_webhook_token_saffronai;
      } else {
        process.env.Cursor_webhook_token_saffronai = prevSaffron;
      }
    }
  });

  it("runs Cursor API helpers under the active token context", async () => {
    const prev = process.env.CURSOR_WEBHOOK_TOKEN;
    process.env.CURSOR_WEBHOOK_TOKEN = "tok-primary";
    try {
      assert.equal(getActiveCursorToken(), "tok-primary");
      await withCursorToken("tok-saffronai-runtime", async () => {
        assert.equal(getActiveCursorToken(), "tok-saffronai-runtime");
      });
      assert.equal(getActiveCursorToken(), "tok-primary");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_WEBHOOK_TOKEN;
      else process.env.CURSOR_WEBHOOK_TOKEN = prev;
    }
  });
});
