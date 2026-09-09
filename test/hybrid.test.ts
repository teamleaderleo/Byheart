import assert from "node:assert/strict";
import test from "node:test";
import { HybridSurface } from "../src/adapters/hybrid.js";
import { ScriptedSurface } from "../src/adapters/scripted.js";

function surfaces() {
  const semantic = new ScriptedSurface({
    adapter: "preflight-starsector",
    sessionId: "game-1",
    entrypoint: "preflight://runtime",
    initialState: { game: "campaign-ready", paused: false },
    actions: {
      "campaign.pause": (state) => {
        state.paused = true;
      },
    },
    semanticChecks: {
      "preflight.state": (state, args) => state.game === args?.state,
    },
  });
  const visual = new ScriptedSurface({
    adapter: "remote-desktop",
    sessionId: "screen-1",
    entrypoint: "remote://vm",
    initialState: { frame: "a" },
    actions: {
      "remote.key": (state, args) => {
        state.frame = `key:${String(args?.key)}`;
      },
    },
  });
  return { semantic, visual };
}

test("hybrid surface routes reviewed game actions to semantic control and remote keys to visual control", async () => {
  const { semantic, visual } = surfaces();
  const surface = new HybridSurface({
    semantic,
    visual,
    adapter: "starsector-hybrid",
    entrypoint: "byheart://starsector",
  });

  const identity = await surface.identity();
  assert.equal(identity.adapter, "starsector-hybrid");

  const pause = await surface.act({ kind: "semantic", name: "campaign.pause" });
  assert.equal(pause.delivered, true);
  assert.equal(semantic.state.paused, true);

  const key = await surface.act({ kind: "semantic", name: "remote.key", args: { key: "W" } });
  assert.equal(key.delivered, true);
  assert.equal(visual.state.frame, "key:W");

  const observed = await surface.check({
    kind: "state_equals",
    path: "semantic.state.paused",
    value: true,
  });
  assert.equal(observed.passed, true);
});
