import assert from "node:assert/strict";
import test from "node:test";
import { MemoryEvidenceSink } from "../src/evidence.js";

test("evidence redacts obvious secret-bearing fields", async () => {
  const sink = new MemoryEvidenceSink();
  await sink.record({
    at: "2026-09-09T00:00:00.000Z",
    runId: "r1",
    kind: "run_started",
    data: {
      token: "secret-token",
      nested: { password: "hunter2", safe: "hello" },
    },
  });
  const event = sink.snapshot()[0];
  assert.equal(event?.data.token, "[REDACTED]");
  const nested = event?.data.nested;
  assert.ok(nested && typeof nested === "object" && !Array.isArray(nested));
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    assert.equal(nested.password, "[REDACTED]");
    assert.equal(nested.safe, "hello");
  }
});
