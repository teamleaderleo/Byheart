import assert from "node:assert/strict";
import test from "node:test";
import { ScriptedSurface } from "../src/adapters/scripted.js";
import { DiscoveryBridge } from "../src/bridge.js";
import { DiscoverySession } from "../src/discovery-session.js";
import { MemoryEvidenceSink } from "../src/evidence.js";

function fixture() {
  const surface = new ScriptedSurface({
    adapter: "scripted",
    entrypoint: "byheart://bridge-test",
    initialState: { status: "idle" },
    actions: {
      advance: (state) => {
        state.status = "done";
      },
    },
  });
  const evidence = new MemoryEvidenceSink();
  const session = new DiscoverySession(
    surface,
    evidence,
    "Reach the done state",
    { adapter: "scripted", entrypoint: "byheart://bridge-test" },
    {
      allowedActions: ["semantic"],
      driverId: "codex-test",
      maxSteps: 4,
    },
  );
  const bridge = new DiscoveryBridge({
    session,
    driverId: "codex-test",
    success: [{ kind: "state_equals", path: "status", value: "done" }],
  });
  return { bridge, evidence };
}

test("external discovery bridge keeps one trace while an agent chooses actions", async () => {
  const { bridge, evidence } = fixture();
  await bridge.start();
  try {
    const state = await fetch(`${bridge.url()}/v1/state`).then((response) => response.json()) as Record<string, unknown>;
    assert.equal(state.protocol, "byheart-external-discovery/v1");
    assert.equal(state.driver, "codex-test");
    assert.equal(state.step, 1);

    const premature = await fetch(`${bridge.url()}/v1/done`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "too early" }),
    });
    assert.equal(premature.status, 409);

    const acted = await fetch(`${bridge.url()}/v1/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: { kind: "semantic", name: "advance" },
        note: "The scripted state exposes the exact useful action.",
      }),
    });
    assert.equal(acted.status, 200);

    const doneResponse = await fetch(`${bridge.url()}/v1/done`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "done state observed" }),
    });
    assert.equal(doneResponse.status, 200);

    const trace = await bridge.waitForCompletion();
    assert.equal(trace.entries.length, 1);
    assert.equal(trace.entries[0]?.action.kind, "semantic");
    assert.ok(evidence.snapshot().some((event) => event.kind === "discovery_decision"));
  } finally {
    await bridge.close();
  }
});
