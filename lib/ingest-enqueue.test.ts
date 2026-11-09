import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("createJob + upsertJob persist dispatched state for async workers", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "relay-ingest-"));
  const prevCwd = process.cwd();
  const prev: Record<string, string | undefined> = {
    RELAY_STORE: process.env.RELAY_STORE,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    VERCEL: process.env.VERCEL,
  };

  try {
    process.chdir(dir);
    process.env.RELAY_STORE = "file";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.QSTASH_TOKEN;
    delete process.env.VERCEL;

    const { createJob, getJob, upsertJob } = await import("./jobs");
    const queued = await createJob({
      source: "slack",
      prompt: "burst concurrency check",
      slackChannelId: "C1",
      slackThreadTs: "1.0",
      slackMessageTs: "1.0",
    });
    assert.equal(queued.status, "queued");

    const dispatched = await upsertJob({
      ...queued,
      status: "dispatched",
      cursorAgentId: "bc-burst-1",
      events: [
        {
          at: new Date().toISOString(),
          type: "dispatched",
          detail: "Started Cursor cloud agent (bc-burst-1)",
        },
        ...queued.events,
      ],
    });
    assert.equal(dispatched.status, "dispatched");
    assert.equal((await getJob(queued.id))?.cursorAgentId, "bc-burst-1");
  } finally {
    process.chdir(prevCwd);
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
