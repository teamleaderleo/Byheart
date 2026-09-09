import assert from "node:assert/strict";
import test from "node:test";
import { compileTrace } from "../src/compiler.js";
import type { DiscoveryTrace } from "../src/types.js";

const trace: DiscoveryTrace = {
  runId: "discover-1",
  goal: "Find member 12345",
  target: { adapter: "scripted", entrypoint: "byheart://demo" },
  startedAt: "2026-09-09T00:00:00.000Z",
  finishedAt: "2026-09-09T00:00:01.000Z",
  entries: [
    {
      step: 1,
      observation: { at: "x", summary: "search" },
      action: { kind: "semantic", name: "lookup", args: { id: "12345" } },
      receipt: {
        requestedAt: "x",
        completedAt: "y",
        delivered: true,
        effectObserved: true,
      },
    },
  ],
};

test("compiler parameterizes a successful trace", () => {
  const artifact = compileTrace(trace, {
    id: "member.lookup",
    name: "Member lookup",
    inputs: { memberId: { type: "string" } },
    outputs: {},
    success: [{ kind: "state_equals", path: "result", value: "found" }],
    parameterize: { memberId: "12345" },
  });
  assert.equal(artifact.steps[0]?.action.kind, "semantic");
  if (artifact.steps[0]?.action.kind === "semantic") {
    assert.equal(artifact.steps[0].action.args?.id, "{{input.memberId}}");
  }
  assert.equal(artifact.provenance?.discoveredRunId, "discover-1");
});
