import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { agentKey, jobKey } from "./job-store";

describe("job-store keys", () => {
  it("builds stable job and agent redis keys", () => {
    assert.equal(jobKey("job_abc"), "relay:job:job_abc");
    assert.equal(
      agentKey("bc_02c12d34-a45c-4c9b-a02a-66dc4709a22d"),
      "relay:agent:bc-02c12d34-a45c-4c9b-a02a-66dc4709a22d",
    );
    assert.equal(
      agentKey("bc-02c12d34-a45c-4c9b-a02a-66dc4709a22d"),
      "relay:agent:bc-02c12d34-a45c-4c9b-a02a-66dc4709a22d",
    );
  });
});
