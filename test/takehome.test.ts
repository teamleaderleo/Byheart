import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { MemoryEvidenceSink } from "../src/evidence.js";
import { PlaywrightSurface } from "../src/adapters/playwright.js";
import { ReplayEngine } from "../src/replay.js";
import type { Capability, ReplayResult } from "../src/types.js";

let target: ChildProcess;
const entrypoint = "http://127.0.0.1:4173";
let stageCapability: Capability;
let submitCapability: Capability;

before(async () => {
  target = spawn(process.execPath, ["demo/legacy-console/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: "4173" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(entrypoint);
  stageCapability = JSON.parse(
    await readFile("examples/capabilities/stage-supplies-order.json", "utf8"),
  ) as Capability;
  submitCapability = JSON.parse(
    await readFile("examples/capabilities/stage-and-submit-order.json", "utf8"),
  ) as Capability;
});

after(() => {
  target?.kill("SIGTERM");
});

test("take-home capability replays through the iframe target", async () => {
  const surface = await PlaywrightSurface.launch({ entrypoint, headless: true });
  try {
    const result = await new ReplayEngine(surface, new MemoryEvidenceSink(), { runId: "browser-success" })
      .run(stageCapability, { market: "ASH-17", quantity: "25" });
    assert.equal(result.status, "success", describe(result));
  } finally {
    await surface.close();
  }
});

test("missing market is returned as a known outcome", async () => {
  const surface = await PlaywrightSurface.launch({ entrypoint, headless: true });
  try {
    const result = await new ReplayEngine(surface, new MemoryEvidenceSink(), { runId: "browser-known" })
      .run(stageCapability, { market: "NOPE-00", quantity: "25" });
    assert.equal(result.status, "known_outcome", describe(result));
    if (result.status === "known_outcome") assert.equal(result.code, "market_not_found");
  } finally {
    await surface.close();
  }
});

test("session expiry is recovered through the normal UI and replay continues", async () => {
  const surface = await PlaywrightSurface.launch({ entrypoint, headless: true });
  try {
    await surface.pageHandle().getByLabel("expire session next action").check();
    const result = await new ReplayEngine(surface, new MemoryEvidenceSink(), { runId: "browser-recovery" })
      .run(stageCapability, { market: "ASH-17", quantity: "25" });
    assert.equal(result.status, "success", describe(result));
  } finally {
    await surface.close();
  }
});

test("unexpected dialog escalates on the same browser session and can resume", async () => {
  const surface = await PlaywrightSurface.launch({ entrypoint, headless: true });
  const evidence = new MemoryEvidenceSink();
  try {
    await surface.pageHandle().getByLabel("surprise dialog next action").check();
    const sessionId = (await surface.identity()).sessionId;
    const result = await new ReplayEngine(surface, evidence, {
      runId: "browser-human-recovery",
      interventionHandler: async (context) => {
        assert.equal(context.session.sessionId, sessionId);
        await surface.pageHandle().getByRole("button", { name: "Continue" }).click();
        const search = await surface.act({
          kind: "click",
          target: { kind: "role", role: "button", name: "Search" },
        });
        assert.equal(search.delivered, true, search.detail);
        return "resume";
      },
    }).run(stageCapability, { market: "ASH-17", quantity: "25" });
    assert.equal(result.status, "success", describe(result));
    assert.ok(evidence.snapshot().some((event) => event.kind === "human_handoff"));
  } finally {
    await surface.close();
  }
});

test("consequential purchase step is never executed before human takeover", async () => {
  const surface = await PlaywrightSurface.launch({ entrypoint, headless: true });
  try {
    const result = await new ReplayEngine(surface, new MemoryEvidenceSink(), { runId: "browser-risk" })
      .run(submitCapability, { market: "ASH-17", quantity: "25" });
    assert.equal(result.status, "intervention_required", describe(result));
    if (result.status === "intervention_required") {
      assert.equal(result.stepId, "submit-purchase");
    }
    const absent = await surface.check({ kind: "text_present", text: "HUMAN APPROVAL REQUIRED" });
    assert.equal(absent.passed, false, absent.detail);
  } finally {
    await surface.close();
  }
});

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 5000;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`demo target did not start: ${String(last)}`);
}

function describe(result: ReplayResult): string {
  return JSON.stringify(result, null, 2);
}
