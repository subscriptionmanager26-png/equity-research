import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { markdownToSlackMrkdwn, markdownToTelegramHtml } from "./chat-markup";

describe("markdownToSlackMrkdwn", () => {
  it("turns headings and bold into Slack mrkdwn", () => {
    assert.equal(
      markdownToSlackMrkdwn("## Hold\n\n**NIM** is back."),
      "*Hold*\n\n*NIM* is back.",
    );
  });

  it("converts markdown links", () => {
    assert.equal(
      markdownToSlackMrkdwn("See [Screener](https://screener.in)."),
      "See <https://screener.in|Screener>.",
    );
  });

  it("leaves fenced code alone", () => {
    const out = markdownToSlackMrkdwn("Use **this**\n```\n**not bold**\n```");
    assert.match(out, /\*this\*/);
    assert.match(out, /```\n\*\*not bold\*\*\n```/);
  });
});

describe("markdownToTelegramHtml", () => {
  it("turns headings and bold into HTML", () => {
    assert.equal(
      markdownToTelegramHtml("## Hold\n\n**NIM** is back."),
      "<b>Hold</b>\n\n<b>NIM</b> is back.",
    );
  });

  it("converts links and code", () => {
    assert.equal(
      markdownToTelegramHtml("See [Screener](https://screener.in) and `NIM`."),
      'See <a href="https://screener.in">Screener</a> and <code>NIM</code>.',
    );
  });
});
