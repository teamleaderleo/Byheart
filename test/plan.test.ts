import assert from "node:assert/strict";
import test from "node:test";
import { ScriptedSurface } from "../src/adapters/scripted.js";
import { CapabilityCatalog } from "../src/catalog.js";
import { MemoryEvidenceSink } from "../src/evidence.js";
import { CapabilityPlanExecutor, type CapabilityPlan } from "../src/plan.js";
import type { Capability } from "../src/types.js";

function capability(
  id: string,
  inputNames: string[],
  actionName: string,
  outputName: string,
): Capability {
  return {
    format: "byheart-capability/v1",
    id,
    name: id,
    version: 1,
    target: { adapter: "scripted", entrypoint: "byheart://plan-test" },
    inputs: Object.fromEntries(inputNames.map((name) => [name, { type: "number" }])),
    outputs: { [outputName]: { type: "number" } },
    steps: [
      {
        id: actionName,
        action: {
          kind: "semantic",
          name: actionName,
          args: Object.fromEntries(inputNames.map((name) => [name, `{{input.${name}}}`])),
        },
        after: [{ kind: "state_equals", path: "status", value: actionName }],
      },
    ],
    success: [{ kind: "state_equals", path: "status", value: actionName }],
    extraction: [{ output: outputName, fromStatePath: "value", as: "number" }],
    policy: {
      allowedAdapters: ["scripted"],
      allowedActions: ["semantic"],
      allowedEntrypoints: ["byheart://plan-test"],
      consequentialPolicy: "require_human",
    },
  };
}

test("plan composes saved capabilities and feeds earlier outputs into later inputs", async () => {
  const set = capability("math.set", ["value"], "set", "value");
  const multiply = capability("math.multiply", ["current", "factor"], "multiply", "product");
  const catalog = new CapabilityCatalog([set, multiply]);
  const surface = new ScriptedSurface({
    adapter: "scripted",
    entrypoint: "byheart://plan-test",
    initialState: { status: "idle", value: 0 },
    actions: {
      set: (state, args) => {
        state.value = Number(args?.value);
        state.status = "set";
      },
      multiply: (state, args) => {
        state.value = Number(args?.current) * Number(args?.factor);
        state.status = "multiply";
      },
    },
  });

  const plan: CapabilityPlan = {
    format: "byheart-plan/v1",
    id: "math.double",
    name: "Set and multiply",
    version: 1,
    inputs: {
      start: { type: "number" },
      factor: { type: "number" },
    },
    outputs: { result: { type: "number" } },
    steps: [
      {
        id: "set",
        capability: { id: "math.set" },
        inputs: { value: "{{input.start}}" },
      },
      {
        id: "multiply",
        capability: { id: "math.multiply" },
        inputs: {
          current: "{{steps.set.outputs.value}}",
          factor: "{{input.factor}}",
        },
      },
    ],
    extraction: {
      result: { from: "steps.multiply.outputs.product", as: "number" },
    },
  };

  const result = await new CapabilityPlanExecutor(
    surface,
    new MemoryEvidenceSink(),
    catalog,
    { runId: "plan-run" },
  ).run(plan, { start: 6, factor: 7 });

  assert.equal(result.status, "success");
  if (result.status === "success") assert.equal(result.outputs.result, 42);
  assert.equal(result.steps.length, 2);
});

test("catalog resolves latest versions while preserving explicit version requests", () => {
  const v1 = capability("math.set", ["value"], "set", "value");
  const v2 = { ...structuredClone(v1), version: 2 };
  const catalog = new CapabilityCatalog([v1, v2]);
  assert.equal(catalog.get({ id: "math.set" }).version, 2);
  assert.equal(catalog.get({ id: "math.set", version: 1 }).version, 1);
  assert.equal(catalog.tools()[0]?.capabilityVersion, 2);
});
