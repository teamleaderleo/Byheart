import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  candidateFromDiscovery,
  candidatePathForCapability,
  promoteCandidate,
  recordVerification,
  writeCandidate,
} from "../src/durability.js";
import type { Capability, DiscoveryTrace, ReplayResult } from "../src/types.js";

const capability: Capability = {
  format: "byheart-capability/v1",
  id: "stage-order",
  name: "Stage order",
  version: 1,
  description: "Stage an order for a market without submitting it.",
  target: { adapter: "browser", entrypoint: "http://127.0.0.1:4173" },
  inputs: {
    market: { type: "string" },
    quantity: { type: "string" },
  },
  outputs: {},
  steps: [
    {
      id: "market",
      action: { kind: "type", target: { kind: "label", label: "Market code" }, text: "{{input.market}}" },
    },
    {
      id: "search",
      action: { kind: "click", target: { kind: "role", role: "button", name: "Search" } },
    },
  ],
  success: [{ kind: "text_present", text: "ORDER STAGED" }],
  policy: {
    allowedAdapters: ["browser"],
    allowedActions: ["type", "click"],
    allowedEntrypoints: ["http://127.0.0.1:4173/*"],
    consequentialPolicy: "require_human",
  },
};

const trace: DiscoveryTrace = {
  runId: "discover-1",
  goal: "Stage an order",
  target: { adapter: "browser", entrypoint: "http://127.0.0.1:4173" },
  startedAt: "2026-09-09T00:00:00.000Z",
  finishedAt: "2026-09-09T00:00:01.000Z",
  entries: [
    {
      step: 1,
      observation: { at: "2026-09-09T00:00:00.000Z", summary: "market form" },
      action: { kind: "type", target: { kind: "label", label: "Market code" }, text: "ASH-17" },
      receipt: {
        requestedAt: "2026-09-09T00:00:00.100Z",
        completedAt: "2026-09-09T00:00:00.200Z",
        delivered: true,
        effectObserved: true,
      },
    },
    {
      step: 2,
      observation: { at: "2026-09-09T00:00:00.300Z", summary: "market entered" },
      action: { kind: "click", target: { kind: "role", role: "button", name: "Search" } },
      receipt: {
        requestedAt: "2026-09-09T00:00:00.400Z",
        completedAt: "2026-09-09T00:00:00.500Z",
        delivered: true,
        effectObserved: true,
      },
    },
  ],
};

test("successful discovery becomes a candidate and distinct replays verify it", () => {
  let candidate = candidateFromDiscovery(trace, capability, { artifactPath: "/tmp/stage-order.json" });
  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.signals.steps, 2);

  candidate = recordVerification(candidate, success("replay-1"), { market: "ASH-17", quantity: "25" });
  assert.equal(candidate.status, "candidate");

  candidate = recordVerification(candidate, success("replay-2"), { market: "VES-04", quantity: "10" });
  assert.equal(candidate.status, "verified");

  candidate = recordVerification(candidate, success("replay-same-input"), { market: "VES-04", quantity: "10" });
  assert.equal(candidate.status, "verified");
});

test("a real failure keeps a candidate out of automatic promotion", () => {
  let candidate = candidateFromDiscovery(trace, capability, { artifactPath: "/tmp/stage-order.json" });
  candidate = recordVerification(candidate, success("replay-1"), { market: "ASH-17", quantity: "25" });
  candidate = recordVerification(candidate, failure("replay-fail"), { market: "NEW-01", quantity: "5" });
  assert.equal(candidate.status, "needs_review");
});

test("verified candidate promotes to a repository-local skill wrapper", async () => {
  const root = await mkdtemp(join(tmpdir(), "byheart-durability-"));
  const artifactPath = join(root, "stage-order.json");
  const candidatePath = candidatePathForCapability(artifactPath);
  await writeFile(artifactPath, JSON.stringify(capability, null, 2), "utf8");

  let candidate = candidateFromDiscovery(trace, capability, { artifactPath });
  candidate = recordVerification(candidate, success("replay-1"), { market: "ASH-17", quantity: "25" });
  candidate = recordVerification(candidate, success("replay-2"), { market: "VES-04", quantity: "10" });
  await writeCandidate(candidatePath, candidate);

  const promoted = await promoteCandidate({
    candidatePath,
    skillsDirectory: join(root, "skills"),
  });
  assert.equal(promoted.candidate.status, "promoted");
  const markdown = await readFile(promoted.skillMarkdown, "utf8");
  assert.match(markdown, /Prefer this deterministic path before rediscovering the same procedure/);
  const index = JSON.parse(await readFile(promoted.indexPath, "utf8")) as { skills: Array<{ id: string }> };
  assert.deepEqual(index.skills.map((item) => item.id), ["stage-order"]);
});

function success(runId: string): ReplayResult {
  return {
    status: "success",
    runId,
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    startedAt: "2026-09-09T00:00:00.000Z",
    finishedAt: "2026-09-09T00:00:01.000Z",
    outputs: {},
    evidence: [],
  };
}

function failure(runId: string): ReplayResult {
  return {
    status: "failure",
    runId,
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    startedAt: "2026-09-09T00:00:00.000Z",
    finishedAt: "2026-09-09T00:00:01.000Z",
    class: "action_failed",
    detail: "target changed",
    evidence: [],
  };
}
