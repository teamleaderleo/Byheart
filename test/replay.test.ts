import assert from "node:assert/strict";
import test from "node:test";
import { MemoryEvidenceSink } from "../src/evidence.js";
import { ReplayEngine } from "../src/replay.js";
import { ScriptedSurface } from "../src/adapters/scripted.js";
import type { Capability } from "../src/types.js";

function capability(): Capability {
  return {
    format: "byheart-capability/v1",
    id: "demo.lookup",
    name: "Demo lookup",
    version: 1,
    target: { adapter: "scripted", entrypoint: "byheart://demo" },
    inputs: { id: { type: "string" } },
    outputs: { value: { type: "number" } },
    steps: [
      {
        id: "lookup",
        action: { kind: "semantic", name: "lookup", args: { id: "{{input.id}}" } },
        knownOutcomes: [
          {
            code: "record_not_found",
            when: { kind: "state_equals", path: "result", value: "not_found" },
          },
        ],
        after: [{ kind: "state_equals", path: "result", value: "found" }],
      },
    ],
    success: [{ kind: "state_equals", path: "screen", value: "detail" }],
    extraction: [{ output: "value", fromStatePath: "value", as: "number" }],
    policy: {
      allowedAdapters: ["scripted"],
      allowedActions: ["semantic"],
      allowedEntrypoints: ["byheart://demo"],
      consequentialPolicy: "require_human",
    },
  };
}

function surface() {
  return new ScriptedSurface({
    adapter: "scripted",
    entrypoint: "byheart://demo",
    initialState: { result: "idle", screen: "search", value: 0 },
    actions: {
      lookup: (state, args) => {
        if (args?.id === "ok") {
          state.result = "found";
          state.screen = "detail";
          state.value = 42;
        } else {
          state.result = "not_found";
        }
      },
    },
  });
}

test("replay returns typed success and extracted outputs", async () => {
  const evidence = new MemoryEvidenceSink();
  const engine = new ReplayEngine(surface(), evidence, { runId: "success" });
  const result = await engine.run(capability(), { id: "ok" });
  assert.equal(result.status, "success");
  if (result.status === "success") assert.equal(result.outputs.value, 42);
  assert.ok(evidence.snapshot().some((event) => event.kind === "action_receipt"));
});

test("replay separates known business outcome from failure", async () => {
  const evidence = new MemoryEvidenceSink();
  const engine = new ReplayEngine(surface(), evidence, { runId: "known" });
  const result = await engine.run(capability(), { id: "missing" });
  assert.equal(result.status, "known_outcome");
  if (result.status === "known_outcome") assert.equal(result.code, "record_not_found");
});

test("replay rejects undeclared inputs before acting", async () => {
  const evidence = new MemoryEvidenceSink();
  const engine = new ReplayEngine(surface(), evidence, { runId: "invalid" });
  const result = await engine.run(capability(), { id: "ok", extra: true });
  assert.equal(result.status, "failure");
  if (result.status === "failure") assert.equal(result.class, "invalid_input");
});

test("replay pauses consequential work when no human handler is attached", async () => {
  const humanSurface = new ScriptedSurface({
    adapter: "scripted",
    entrypoint: "byheart://demo",
    initialState: { submitted: false },
    actions: { submit: (state) => { state.submitted = true; } },
  });
  const evidence = new MemoryEvidenceSink();
  const risky = consequentialCapability();
  const result = await new ReplayEngine(humanSurface, evidence, { runId: "handoff-only" }).run(risky, {});
  assert.equal(result.status, "intervention_required");
  assert.equal(humanSurface.state.submitted, false);
});

test("same live session can pass to a human and resume deterministic replay", async () => {
  const humanSurface = new ScriptedSurface({
    adapter: "scripted",
    entrypoint: "byheart://demo",
    initialState: { submitted: false },
    actions: { submit: (state) => { state.submitted = true; } },
  });
  const evidence = new MemoryEvidenceSink();
  const result = await new ReplayEngine(humanSurface, evidence, {
    runId: "handoff-resume",
    interventionHandler: async (context) => {
      assert.equal(context.session.sessionId, "scripted-session");
      (context.surface as ScriptedSurface).state.submitted = true;
      return "resume";
    },
  }).run(consequentialCapability(), {});

  assert.equal(result.status, "success");
  const phases = evidence.snapshot()
    .filter((event) => event.kind === "human_handoff")
    .map((event) => event.data.phase);
  assert.deepEqual(phases, ["paused_for_review", "human_owned", "automation_resumed"]);
});

function consequentialCapability(): Capability {
  return {
    format: "byheart-capability/v1",
    id: "demo.submit",
    name: "Submit demo order",
    version: 1,
    target: { adapter: "scripted", entrypoint: "byheart://demo" },
    inputs: {},
    outputs: {},
    steps: [
      {
        id: "submit",
        action: { kind: "semantic", name: "submit", risk: "consequential" },
        after: [{ kind: "state_equals", path: "submitted", value: true }],
      },
    ],
    success: [{ kind: "state_equals", path: "submitted", value: true }],
    policy: {
      allowedAdapters: ["scripted"],
      allowedActions: ["semantic"],
      allowedEntrypoints: ["byheart://demo"],
      consequentialActions: ["submit"],
      consequentialPolicy: "require_human",
    },
  };
}
