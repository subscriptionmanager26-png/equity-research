import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findThreadReportResendFallback,
  wantsPriorReportResend,
} from "./report-fallback";
import type { Job } from "./types";

function job(overrides: Partial<Job> & Pick<Job, "id" | "prompt">): Job {
  return {
    source: "slack",
    status: "replied",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("wantsPriorReportResend", () => {
  it("does not match new research questions that mention report", () => {
    assert.equal(wantsPriorReportResend("give me report on ITC"), false);
    assert.equal(wantsPriorReportResend("flights del to blr 19th sept"), false);
  });

  it("matches explicit resend requests", () => {
    assert.equal(
      wantsPriorReportResend("you did not share the markdown file"),
      true,
    );
    assert.equal(wantsPriorReportResend("please attach the report again"), true);
  });
});

describe("findThreadReportResendFallback", () => {
  const goldReport = "Gold Today (31 Aug 2026)\n\n".repeat(40);

  it("does not substitute a prior report for unrelated prompts", () => {
    const prior = job({
      id: "job_gold",
      prompt: "gold price today",
      slackChannelId: "C1",
      slackThreadTs: "100.1",
      slackUserId: "U1",
      reply: { message: goldReport, status: "finished", receivedAt: "" },
    });
    const current = job({
      id: "job_itc",
      prompt: "give me report on ITC",
      status: "dispatched",
      slackChannelId: "C1",
      slackThreadTs: "200.2",
      slackUserId: "U1",
    });

    assert.equal(
      findThreadReportResendFallback(current, [prior, current]),
      undefined,
    );
  });

  it("resends only within the same thread when user asks", () => {
    const prior = job({
      id: "job_gold",
      prompt: "gold price today",
      slackChannelId: "C1",
      slackThreadTs: "100.1",
      slackUserId: "U1",
      reply: { message: goldReport, status: "finished", receivedAt: "" },
    });
    const current = job({
      id: "job_resend",
      prompt: "you did not attach the markdown file",
      status: "dispatched",
      slackChannelId: "C1",
      slackThreadTs: "100.1",
      slackUserId: "U1",
    });

    assert.equal(
      findThreadReportResendFallback(current, [prior, current]),
      goldReport,
    );
  });
});
