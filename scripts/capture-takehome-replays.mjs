#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FileEvidenceSink } from "../dist/src/evidence-file.js";
import { PlaywrightSurface } from "../dist/src/adapters/playwright.js";
import { ReplayEngine } from "../dist/src/replay.js";

const root = resolve("evidence/generated");
const entrypoint = "http://127.0.0.1:4173";
const stageCapability = JSON.parse(
  await readFile("examples/capabilities/stage-supplies-order.json", "utf8"),
);
const submitCapability = JSON.parse(
  await readFile("examples/capabilities/stage-and-submit-order.json", "utf8"),
);

await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });

const target = spawn(process.execPath, ["demo/legacy-console/server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: "4173" },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(entrypoint);

  const cases = [];
  cases.push(await runCase("replay-success", stageCapability, { market: "VES-04", quantity: "10" }));
  cases.push(await runCase("replay-known-outcome", stageCapability, { market: "NOPE-00", quantity: "25" }));
  cases.push(await runCase(
    "replay-session-recovery",
    stageCapability,
    { market: "ASH-17", quantity: "25" },
    async (surface) => surface.pageHandle().getByLabel("expire session next action").check(),
  ));

  const broken = structuredClone(stageCapability);
  const openOrder = broken.steps.find((step) => step.id === "open-order");
  if (!openOrder) throw new Error("example capability is missing open-order");
  openOrder.action = {
    kind: "click",
    target: { kind: "role", role: "button", name: "Removed legacy control" },
  };
  openOrder.retry = { maxAttempts: 1 };
  openOrder.onFailure = "fail";
  cases.push(await runCase("replay-hard-failure", broken, { market: "ASH-17", quantity: "25" }));

  cases.push(await runCase(
    "replay-consequence-boundary",
    submitCapability,
    { market: "ASH-17", quantity: "25" },
  ));

  const manifest = {
    format: "byheart-takehome-evidence-manifest/v1",
    generatedAt: new Date().toISOString(),
    entrypoint,
    note: "These are deterministic replay fixtures. Genuine model-driven discovery and manual same-session takeover are captured separately as described in evidence/README.md.",
    cases,
  };
  await writeFile(resolve(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Wrote deterministic evidence to ${root}`);
} finally {
  target.kill("SIGTERM");
}

async function runCase(name, capability, inputs, setup) {
  const directory = resolve(root, name);
  await mkdir(directory, { recursive: true });
  const evidence = new FileEvidenceSink(directory, "events.jsonl");
  const surface = await PlaywrightSurface.launch({
    entrypoint,
    headless: true,
    artifactDir: resolve(directory, "screenshots"),
  });
  try {
    await setup?.(surface);
    const result = await new ReplayEngine(surface, evidence, { runId: name }).run(capability, inputs);
    await surface.captureEvidence?.(`final-${result.status}`);
    await writeFile(resolve(directory, "result.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
    return {
      name,
      inputs,
      status: result.status,
      ...(result.status === "success" ? { outputs: result.outputs } : {}),
      ...(result.status === "known_outcome" ? { code: result.code } : {}),
      ...(result.status === "failure" ? { class: result.class, stepId: result.stepId ?? null } : {}),
      ...(result.status === "intervention_required" ? { stepId: result.stepId } : {}),
      directory: `evidence/generated/${name}`,
    };
  } finally {
    await surface.close();
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 5000;
  let last;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      last = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error(`demo target did not start: ${String(last)}`);
}
