import assert from "node:assert/strict";
import test from "node:test";
import {
  CheckpointSearchRunner,
  type CheckpointEnvironment,
  type SearchCandidate,
} from "../src/checkpoint-search.js";
import type { JsonObject } from "../src/types.js";

class FakeCampaign implements CheckpointEnvironment {
  restores: JsonObject[] = [];

  async restore(checkpoint: JsonObject): Promise<void> {
    this.restores.push(structuredClone(checkpoint));
  }

  async execute(candidate: SearchCandidate): Promise<JsonObject> {
    return structuredClone(candidate.payload);
  }

  async score(result: JsonObject): Promise<Record<string, number>> {
    return {
      profit: Number(result.profit),
      risk: Number(result.risk),
    };
  }
}

test("checkpoint search restores the same baseline for every candidate and keeps the Pareto frontier", async () => {
  const environment = new FakeCampaign();
  const runner = new CheckpointSearchRunner(
    environment,
    [
      { metric: "profit", direction: "maximize", weight: 1 },
      { metric: "risk", direction: "minimize", weight: 5 },
    ],
    { runId: "search-1" },
  );

  const checkpoint = { save: "before-trip", credits: 50_000 };
  const result = await runner.run(checkpoint, [
    { id: "smuggle-direct", payload: { profit: 100, risk: 10 } },
    { id: "safe-detour", payload: { profit: 80, risk: 2 } },
    { id: "bad-route", payload: { profit: 70, risk: 12 } },
  ]);

  assert.equal(environment.restores.length, 3);
  assert.deepEqual(environment.restores, [checkpoint, checkpoint, checkpoint]);
  assert.deepEqual(result.paretoFrontier.sort(), ["safe-detour", "smuggle-direct"]);
  assert.equal(result.bestByUtility, "safe-detour");
});
