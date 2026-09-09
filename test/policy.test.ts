import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePolicy } from "../src/policy.js";
import type { CapabilityPolicy, SurfaceIdentity } from "../src/types.js";

const identity: SurfaceIdentity = {
  adapter: "browser",
  sessionId: "s1",
  entrypoint: "http://localhost:3000/app",
};

const policy: CapabilityPolicy = {
  allowedAdapters: ["browser"],
  allowedActions: ["click", "semantic", "navigate"],
  allowedEntrypoints: ["http://localhost:3000/*"],
  consequentialActions: ["submit_purchase"],
  consequentialPolicy: "require_human",
};

test("policy allows reversible actions on an allowed surface", () => {
  assert.deepEqual(
    evaluatePolicy(policy, identity, {
      kind: "click",
      target: { kind: "role", role: "button", name: "Options" },
    }),
    { decision: "allow" },
  );
});

test("policy treats equivalent root URLs with and without trailing slash as the same entrypoint", () => {
  const rootPolicy: CapabilityPolicy = {
    ...policy,
    allowedEntrypoints: ["http://localhost:3000"],
  };
  const decision = evaluatePolicy(
    rootPolicy,
    { ...identity, entrypoint: "http://localhost:3000/" },
    { kind: "click", target: { kind: "text", text: "Continue" } },
  );
  assert.equal(decision.decision, "allow");
});

test("policy routes consequential actions to human", () => {
  const decision = evaluatePolicy(policy, identity, {
    kind: "semantic",
    name: "submit_purchase",
  });
  assert.equal(decision.decision, "require_human");
});

test("policy rejects an unexpected entrypoint", () => {
  const decision = evaluatePolicy(policy, { ...identity, entrypoint: "https://example.com" }, {
    kind: "click",
    target: { kind: "text", text: "Continue" },
  });
  assert.equal(decision.decision, "deny");
});

test("policy rejects navigation outside the allowed destination set", () => {
  const decision = evaluatePolicy(policy, identity, {
    kind: "navigate",
    url: "https://example.com/phish",
  });
  assert.equal(decision.decision, "deny");
});
