import { MemoryEvidenceSink } from "./evidence.js";
import { ReplayEngine } from "./replay.js";
import { ScriptedSurface } from "./adapters/scripted.js";
import type { Capability, JsonObject } from "./types.js";

const surface = new ScriptedSurface({
  adapter: "scripted",
  sessionId: "demo-session",
  entrypoint: "byheart://demo/member-console",
  initialState: {
    screen: "search",
    memberId: "",
    result: "idle",
    balance: 0,
  },
  actions: {
    "member.search": (state, args) => {
      const memberId = String(args?.memberId ?? "");
      state.memberId = memberId;
      if (memberId === "12345") {
        state.screen = "detail";
        state.result = "found";
        state.balance = 8421.17;
      } else {
        state.result = "not_found";
      }
    },
  },
});

const capability: Capability = {
  format: "byheart-capability/v1",
  id: "member.lookup-balance",
  name: "Lookup member savings balance",
  version: 1,
  target: {
    adapter: "scripted",
    entrypoint: "byheart://demo/member-console",
  },
  inputs: {
    memberId: { type: "string", description: "Member identifier" },
  },
  outputs: {
    balance: { type: "number" },
  },
  steps: [
    {
      id: "search-member",
      action: {
        kind: "semantic",
        name: "member.search",
        args: { memberId: "{{input.memberId}}" },
      },
      knownOutcomes: [
        {
          code: "member_not_found",
          when: { kind: "state_equals", path: "result", value: "not_found" },
          detail: "The requested member does not exist in this demo dataset.",
        },
      ],
      after: [{ kind: "state_equals", path: "screen", value: "detail" }],
    },
  ],
  success: [{ kind: "state_equals", path: "result", value: "found" }],
  extraction: [{ output: "balance", fromStatePath: "balance", as: "number" }],
  policy: {
    allowedAdapters: ["scripted"],
    allowedActions: ["semantic"],
    allowedEntrypoints: ["byheart://demo/member-console"],
    consequentialPolicy: "require_human",
  },
};

const evidence = new MemoryEvidenceSink();
const engine = new ReplayEngine(surface, evidence, { runId: "demo-run" });
const result = await engine.run(capability, { memberId: "12345" });
console.log(JSON.stringify(result, null, 2));
console.log("\nEvidence:\n" + evidence.jsonl());

void (surface.state as JsonObject);
