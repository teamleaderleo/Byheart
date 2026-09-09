import assert from "node:assert/strict";
import test from "node:test";
import {
  PreflightGameSurface,
  type PreflightRuntimeState,
  type PreflightRuntimeTransport,
} from "../src/adapters/preflight.js";

const state: PreflightRuntimeState = {
  format: "starsector-preflight-runtime-state-v2",
  pid: 4242,
  processStartedAt: "2026-09-09T18:00:00.000Z",
  state: "campaign-ready",
  sequence: 7,
  observedAt: "2026-09-09T18:00:05.000Z",
};

class FakeTransport implements PreflightRuntimeTransport {
  actions: string[] = [];

  async state(): Promise<PreflightRuntimeState> {
    return { ...state };
  }

  async act(action: import("../src/adapters/preflight.js").PreflightRuntimeAction) {
    this.actions.push(action);
    return {
      action,
      sequence: 8,
      executed: true,
      verified: true,
      detail: `${action} verified`,
      before: { ...state },
      after: { ...state, sequence: 8, observedAt: "2026-09-09T18:00:06.000Z" },
      receipt: {
        format: "starsector-preflight-runtime-action-receipt-v6",
        status: "executed",
        afterPaused: action === "campaign.pause",
      },
    };
  }
}

test("Preflight adapter exposes one exact game process as a semantic Byheart surface", async () => {
  const transport = new FakeTransport();
  const surface = new PreflightGameSurface({ transport });

  const identity = await surface.identity();
  assert.equal(identity.adapter, "preflight-starsector");
  assert.equal(identity.sessionId, "4242@2026-09-09T18:00:00.000Z");

  const check = await surface.check({
    kind: "semantic",
    name: "preflight.state",
    args: { state: "campaign-ready" },
  });
  assert.equal(check.passed, true);

  const receipt = await surface.act({ kind: "semantic", name: "campaign.pause" });
  assert.equal(receipt.delivered, true);
  assert.equal(receipt.effectObserved, true);
  assert.deepEqual(transport.actions, ["campaign.pause"]);
});

test("Preflight adapter declines actions outside the reviewed catalog", async () => {
  const surface = new PreflightGameSurface({ transport: new FakeTransport() });
  const receipt = await surface.act({ kind: "semantic", name: "campaign.teleport-everywhere" });
  assert.equal(receipt.delivered, false);
  assert.equal(receipt.effectObserved, false);
});
