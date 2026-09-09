import assert from "node:assert/strict";
import test from "node:test";
import { OperatorGate } from "../src/operator.js";
import { ScriptedSurface } from "../src/adapters/scripted.js";
import type { Capability, CapabilityStep } from "../src/types.js";

const capability: Capability = {
  format: "byheart-capability/v1",
  id: "operator.test",
  name: "Operator test",
  version: 1,
  target: { adapter: "scripted", entrypoint: "byheart://operator" },
  inputs: {},
  outputs: {},
  steps: [],
  success: [{ kind: "text_present", text: "done" }],
  policy: {
    allowedAdapters: ["scripted"],
    allowedActions: ["semantic"],
    consequentialPolicy: "require_human",
  },
};

const step: CapabilityStep = {
  id: "human-step",
  action: { kind: "semantic", name: "approve", risk: "consequential" },
};

test("operator gate exposes a pending takeover and resumes it", async () => {
  const gate = new OperatorGate();
  const surface = new ScriptedSurface({
    adapter: "scripted",
    entrypoint: "byheart://operator",
    initialState: { status: "waiting" },
    actions: {},
  });
  await gate.start();
  try {
    const pending = gate.handler({
      runId: "run-operator",
      capability,
      step,
      reason: "human approval required",
      session: await surface.identity(),
      surface,
    });

    const page = await fetch(gate.url());
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.ok(html.includes("HUMAN TAKEOVER"));
    assert.ok(html.includes("human-step"));

    const resume = await fetch(`${gate.url()}/resume`, { method: "POST", redirect: "manual" });
    assert.equal(resume.status, 303);
    assert.equal(await pending, "resume");
  } finally {
    await gate.close();
  }
});
