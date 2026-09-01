import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatReplyForDelivery } from "./delivery-format";

describe("formatReplyForDelivery", () => {
  it("passes chat text through unchanged", () => {
    const message = "Short answer about flights.";
    const result = formatReplyForDelivery(message);
    assert.equal(result.text, message);
    assert.equal(result.files.length, 0);
  });

  it("does not synthesize markdown from long text", () => {
    const message = "x".repeat(2000);
    const result = formatReplyForDelivery(message);
    assert.equal(result.text, message);
    assert.equal(result.files.length, 0);
  });

  it("forwards collected files unchanged", () => {
    const file = {
      name: "del-blr-flights-report.md",
      bytes: new TextEncoder().encode("# Flights"),
      mime: "text/markdown",
    };
    const result = formatReplyForDelivery("Summary in chat.", [file]);
    assert.equal(result.text, "Summary in chat.");
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.name, "del-blr-flights-report.md");
  });

  it("drops PDFs unless allowPdf is set", () => {
    const result = formatReplyForDelivery(
      "See attached.",
      [
        { name: "report.pdf", bytes: new Uint8Array([1]) },
        { name: "report.md", bytes: new Uint8Array([2]) },
      ],
    );
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.name, "report.md");
  });
});
