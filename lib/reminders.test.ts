import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseTimedReminder,
  reminderAckText,
  reminderFireText,
} from "./reminders";

describe("parseTimedReminder", () => {
  it("parses remind in N mins to task", () => {
    const parsed = parseTimedReminder("remind in 3 mins to turn off laptop");
    assert.ok(parsed);
    assert.equal(parsed!.delaySeconds, 180);
    assert.equal(parsed!.task, "turn off laptop");
    assert.equal(parsed!.label, "3 minutes");
  });

  it("parses remind me in N minutes", () => {
    const parsed = parseTimedReminder(
      "Can you remind me in 5 minutes to close my laptop .",
    );
    assert.ok(parsed);
    assert.equal(parsed!.delaySeconds, 300);
    assert.equal(parsed!.task, "close my laptop");
  });

  it("parses remind to X in N minutes", () => {
    const parsed = parseTimedReminder("remind me to stretch in 10 minutes");
    assert.ok(parsed);
    assert.equal(parsed!.delaySeconds, 600);
    assert.equal(parsed!.task, "stretch");
  });

  it("ignores ordinary research prompts", () => {
    assert.equal(parseTimedReminder("analyze NVDA for 3 years"), null);
  });
});

describe("reminder copy", () => {
  it("builds ack and fire text", () => {
    const parsed = parseTimedReminder("remind in 3 mins to turn off laptop")!;
    assert.match(reminderAckText(parsed), /3 minutes/);
    assert.equal(reminderFireText(parsed), "Reminder: turn off laptop");
  });
});
