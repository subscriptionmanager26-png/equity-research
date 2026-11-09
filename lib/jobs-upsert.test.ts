import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("upsertJob reinserts a missing job so dispatched agents are not orphaned", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "relay-store-"));
  const prevCwd = process.cwd();
  const prevStore = process.env.RELAY_STORE;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  const prevBlobId = process.env.BLOB_STORE_ID;
  const prevRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const prevRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    process.chdir(dir);
    process.env.RELAY_STORE = "file";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { upsertJob, getJob, listJobs } = await import("./jobs");
    const job = {
      id: "job_orphan_test",
      createdAt: "2026-11-09T05:00:00.000Z",
      updatedAt: "2026-11-09T05:00:00.000Z",
      source: "slack" as const,
      prompt: "analyze bajaj finance",
      slackChannelId: "C0B66RAV0Q7",
      slackThreadTs: "1794200451.707979",
      status: "dispatched" as const,
      cursorAgentId: "bc-c09cda9e-2fff-4fae-929e-825b48e3022b",
      events: [
        {
          at: "2026-11-09T05:00:54.000Z",
          type: "dispatched",
          detail: "Started Cursor cloud agent (bc-c09cda9e-2fff-4fae-929e-825b48e3022b)",
        },
      ],
    };

    const saved = await upsertJob(job);
    assert.equal(saved.id, job.id);
    assert.equal(saved.cursorAgentId, job.cursorAgentId);
    assert.equal((await getJob(job.id))?.status, "dispatched");
    assert.equal((await listJobs()).some((item) => item.id === job.id), true);

    const again = await upsertJob({
      ...job,
      status: "replied",
      reply: {
        message: "done",
        status: "finished",
        receivedAt: "2026-11-09T05:10:00.000Z",
      },
    });
    assert.equal(again.status, "replied");
    assert.equal((await getJob(job.id))?.status, "replied");
  } finally {
    process.chdir(prevCwd);
    if (prevStore === undefined) delete process.env.RELAY_STORE;
    else process.env.RELAY_STORE = prevStore;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
    if (prevBlobId === undefined) delete process.env.BLOB_STORE_ID;
    else process.env.BLOB_STORE_ID = prevBlobId;
    if (prevRedisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = prevRedisUrl;
    if (prevRedisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = prevRedisToken;
    await rm(dir, { recursive: true, force: true });
  }
});
