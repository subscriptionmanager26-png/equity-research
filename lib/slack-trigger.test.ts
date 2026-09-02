import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { messageTriggersRelay } from "./slack";

describe("messageTriggersRelay", () => {
  it("wakes on @pocketedge at the start of a user question", () => {
    assert.equal(
      messageTriggersRelay(
        "@pocketedge: no midcap50momentum150 funds 2y+?\n\nAlso, test returns",
      ),
      true,
    );
    assert.equal(messageTriggersRelay("@pocketedge hello"), true);
  });

  it("does not treat Relay answers that mention pocketedge later as new jobs", () => {
    assert.equal(
      messageTriggersRelay(
        "Got it — your summary matches how this works.\n\n*@pocketedge* wakes the agent in a thread",
      ),
      false,
    );
    assert.equal(
      messageTriggersRelay(
        "Ready when you are.\n\nYou've set the stage — @pocketedge in a thread, one agent per thread",
      ),
      false,
    );
  });
});
