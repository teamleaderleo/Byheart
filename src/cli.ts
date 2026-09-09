#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DiscoveryBridge } from "./bridge.js";
import { compileTrace } from "./compiler.js";
import { DiscoveryRunner } from "./discovery.js";
import { DiscoverySession } from "./discovery-session.js";
import {
  candidateFromDiscovery,
  candidatePathForCapability,
  promoteCandidate,
  readCandidate,
  recordVerification,
  renderDurabilityMemo,
  writeCandidate,
} from "./durability.js";
import { FileEvidenceSink } from "./evidence-file.js";
import { OpenAIDecisionModel } from "./models/openai.js";
import { OperatorGate } from "./operator.js";
import { PlaywrightSurface } from "./adapters/playwright.js";
import { ReplayEngine } from "./replay.js";
import type {
  Capability,
  Condition,
  DiscoveryTrace,
  JsonPrimitive,
  JsonValue,
  KnownOutcomeRule,
  ReplayResult,
  ValueSchema,
} from "./types.js";

const [command, ...argv] = process.argv.slice(2);

try {
  switch (command) {
    case "teach":
      await teachExternal(argv);
      break;
    case "teach-api":
      await teachApi(argv);
      break;
    case "replay":
      await replay(argv);
      break;
    case "promote":
      await promote(argv);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      usage();
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}

async function teachExternal(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const config = teachConfig(args);
  const driverId = args.first("driver") ?? "codex";

  await mkdir(config.runDirectory, { recursive: true });
  await mkdir(resolve(config.output, ".."), { recursive: true });

  const evidence = new FileEvidenceSink(config.runDirectory, "discovery.jsonl");
  const surface = await PlaywrightSurface.launch({
    entrypoint: config.url,
    headless: !config.headed,
    artifactDir: resolve(config.runDirectory, "screenshots"),
  });
  const success: Condition[] = [{ kind: "text_present", text: config.successText }];
  const allowedEntrypoints = browserEntrypoints(config.url);
  const session = new DiscoverySession(
    surface,
    evidence,
    config.goal,
    { adapter: "browser", entrypoint: config.url },
    {
      maxSteps: config.maxSteps,
      allowedActions: ["navigate", "click", "type", "select", "read", "wait"],
      allowedEntrypoints,
      consequentialPolicy: "require_human",
      driverId,
    },
  );
  const bridge = new DiscoveryBridge({ session, success, driverId });

  try {
    await bridge.start();
    console.log(`Byheart discovery bridge: ${bridge.url()}`);
    console.log(`Driver: ${driverId}`);
    console.log("Give the agent CODEX.md or have it GET /v1/state, POST one action at a time to /v1/action, and POST /v1/done only after the declared success condition is visible.");
    console.log(`Run evidence: ${config.runDirectory}`);

    const trace = await bridge.waitForCompletion();
    const capability = compileLearnedCapability(trace, config, driverId, evidence.refs().map((item) => item.uri), allowedEntrypoints);
    const candidatePath = await writeLearnedArtifacts(surface, trace, capability, config);

    console.log(`Learned ${capability.name}`);
    console.log(`Artifact: ${config.output}`);
    console.log(`Durability candidate: ${candidatePath}`);
    console.log(`Actions compiled: ${capability.steps.length}`);
  } finally {
    await bridge.close();
    await surface.close();
  }
}

async function teachApi(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const config = teachConfig(args);
  await mkdir(config.runDirectory, { recursive: true });
  await mkdir(resolve(config.output, ".."), { recursive: true });

  const evidence = new FileEvidenceSink(config.runDirectory, "discovery.jsonl");
  const surface = await PlaywrightSurface.launch({
    entrypoint: config.url,
    headless: !config.headed,
    artifactDir: resolve(config.runDirectory, "screenshots"),
  });

  try {
    const model = new OpenAIDecisionModel({
      ...(args.first("model") ? { model: args.first("model")! } : {}),
      reasoningEffort: (args.first("reasoning") as "none" | "low" | "medium" | "high" | undefined) ?? "low",
    });
    const runner = new DiscoveryRunner(surface, model, evidence);
    const trace = await runner.run(config.goal, { adapter: "browser", entrypoint: config.url }, {
      maxSteps: config.maxSteps,
      allowedActions: ["navigate", "click", "type", "select", "read", "wait"],
      consequentialPolicy: "require_human",
    });
    const allowedEntrypoints = browserEntrypoints(config.url);
    const capability = compileLearnedCapability(
      trace,
      config,
      model.id,
      evidence.refs().map((item) => item.uri),
      allowedEntrypoints,
    );
    const candidatePath = await writeLearnedArtifacts(surface, trace, capability, config);

    console.log(`Learned ${capability.name}`);
    console.log(`Artifact: ${config.output}`);
    console.log(`Durability candidate: ${candidatePath}`);
    console.log(`Evidence: ${config.runDirectory}`);
    console.log(`Actions compiled: ${capability.steps.length}`);
  } finally {
    await surface.close();
  }
}

async function replay(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const capabilityPath = resolve(required(args, "capability"));
  const capability = JSON.parse(await readFile(capabilityPath, "utf8")) as Capability;
  const inputs = parseAssignments(args.all("input"));
  const runDirectory = resolve(args.first("run-dir") ?? `runtime/replay-${Date.now()}`);
  const headed = args.has("headed") || args.has("operator");

  await mkdir(runDirectory, { recursive: true });
  const evidence = new FileEvidenceSink(runDirectory, "replay.jsonl");
  const surface = await PlaywrightSurface.launch({
    entrypoint: capability.target.entrypoint ?? required(args, "url"),
    headless: !headed,
    artifactDir: resolve(runDirectory, "screenshots"),
  });
  const operator = args.has("operator") ? new OperatorGate() : undefined;

  try {
    if (operator) {
      await operator.start();
      console.log(`Operator surface: ${operator.url()}`);
    }

    const engine = new ReplayEngine(surface, evidence, {
      ...(operator ? { interventionHandler: operator.handler } : {}),
    });
    const result = await engine.run(capability, inputs);
    await surface.captureEvidence?.(`replay-${result.status}`);
    await writeFile(resolve(runDirectory, "result.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
    const candidate = await maybeRecordDurabilityVerification(capabilityPath, result, inputs, runDirectory);
    console.log(JSON.stringify(result, null, 2));
    console.log(`Evidence: ${runDirectory}`);
    if (candidate) {
      console.log(`Durability status: ${candidate.status}`);
      if (candidate.status === "verified") {
        console.log(`Verified candidate. Promote with: npm run byheart -- promote --candidate ${candidatePathForCapability(capabilityPath)}`);
      }
    }
  } finally {
    await operator?.close();
    await surface.close();
  }
}

async function promote(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const candidatePath = resolve(required(args, "candidate"));
  const result = await promoteCandidate({
    candidatePath,
    ...(args.first("skills-dir") ? { skillsDirectory: resolve(args.first("skills-dir")!) } : {}),
  });
  console.log(`Promoted ${result.candidate.id}`);
  console.log(`Skill: ${result.skillMarkdown}`);
  console.log(`Capability: ${result.capabilityPath}`);
  console.log(`Index: ${result.indexPath}`);
}

interface TeachConfig {
  url: string;
  goal: string;
  successText: string;
  name: string;
  id: string;
  output: string;
  runDirectory: string;
  headed: boolean;
  maxSteps: number;
  parameters: Record<string, string>;
  knownOutcomes: KnownOutcomeRule[];
}

function teachConfig(args: ParsedArgs): TeachConfig {
  const url = required(args, "url");
  const goal = required(args, "goal");
  const successText = required(args, "success-text");
  const name = args.first("name") ?? "learned-capability";
  const id = args.first("id") ?? slug(name);
  return {
    url,
    goal,
    successText,
    name,
    id,
    output: resolve(args.first("output") ?? `runtime/${id}.json`),
    runDirectory: resolve(args.first("run-dir") ?? `runtime/discovery-${Date.now()}`),
    headed: args.has("headed"),
    maxSteps: Number(args.first("max-steps") ?? 30),
    parameters: parseAssignments(args.all("parameter")),
    knownOutcomes: parseKnownOutcomes(args.all("known-outcome")),
  };
}

function compileLearnedCapability(
  trace: DiscoveryTrace,
  config: TeachConfig,
  driverId: string,
  evidenceUris: string[],
  allowedEntrypoints: string[],
): Capability {
  const inputSchemas: Record<string, ValueSchema> = Object.fromEntries(
    Object.keys(config.parameters).map((parameter) => [parameter, { type: "string" }]),
  );
  const parameterize: Record<string, JsonPrimitive> = config.parameters;
  const capability = compileTrace(trace, {
    id: config.id,
    name: config.name,
    description: config.goal,
    inputs: inputSchemas,
    outputs: {},
    success: [{ kind: "text_present", text: config.successText }],
    parameterize,
    model: driverId,
    policy: {
      allowedAdapters: ["browser"],
      allowedEntrypoints,
      consequentialPolicy: "require_human",
    },
  });
  hardenCompiledCapability(capability, config.knownOutcomes);
  capability.provenance = {
    ...capability.provenance,
    evidence: evidenceUris,
  };
  return capability;
}

async function writeLearnedArtifacts(
  surface: PlaywrightSurface,
  trace: DiscoveryTrace,
  capability: Capability,
  config: TeachConfig,
): Promise<string> {
  await writeFile(config.output, JSON.stringify(capability, null, 2) + "\n", "utf8");
  await writeFile(resolve(config.runDirectory, "trace.json"), JSON.stringify(trace, null, 2) + "\n", "utf8");
  await surface.captureEvidence?.("discovery-final");

  const candidate = candidateFromDiscovery(trace, capability, { artifactPath: config.output });
  const candidatePath = candidatePathForCapability(config.output);
  await writeCandidate(candidatePath, candidate);
  await writeFile(resolve(config.runDirectory, "DURABILITY.md"), renderDurabilityMemo(candidate), "utf8");
  return candidatePath;
}

async function maybeRecordDurabilityVerification(
  capabilityPath: string,
  result: ReplayResult,
  inputs: Record<string, string>,
  runDirectory: string,
): Promise<Awaited<ReturnType<typeof readCandidate>> | undefined> {
  const candidatePath = candidatePathForCapability(capabilityPath);
  try {
    const candidate = await readCandidate(candidatePath);
    const updated = recordVerification(candidate, result, inputs);
    await writeCandidate(candidatePath, updated);
    await writeFile(resolve(runDirectory, "DURABILITY.md"), renderDurabilityMemo(updated), "utf8");
    return updated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function hardenCompiledCapability(capability: Capability, knownOutcomes: KnownOutcomeRule[]): void {
  for (const step of capability.steps) {
    step.retry = { maxAttempts: 2, backoffMs: 100 };
    step.onFailure = "human";
    if (knownOutcomes.length) step.knownOutcomes = knownOutcomes;
    step.recoveries = [
      {
        when: { kind: "text_present", text: "Session expired" },
        actions: [
          {
            kind: "click",
            target: { kind: "role", role: "button", name: "Re-authenticate" },
            description: "Recover the demo session through its normal UI path",
          },
        ],
      },
    ];
  }
}

function parseKnownOutcomes(values: string[]): KnownOutcomeRule[] {
  return values.map((value) => {
    const separator = value.indexOf("=");
    if (separator < 1) throw new Error(`known outcome must be code=text: ${value}`);
    const code = value.slice(0, separator);
    const text = value.slice(separator + 1);
    return {
      code,
      when: { kind: "text_present", text },
      detail: `Observed ${text}`,
    };
  });
}

function parseAssignments(values: string[]): Record<string, string> {
  return Object.fromEntries(values.map((value) => {
    const separator = value.indexOf("=");
    if (separator < 1) throw new Error(`expected name=value: ${value}`);
    return [value.slice(0, separator), value.slice(separator + 1)];
  }));
}

function browserEntrypoints(url: string): string[] {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return [`${parsed.origin}/*`];
  } catch {
    // Non-URL adapter entrypoints stay exact.
  }
  return [url];
}

interface ParsedArgs {
  first(name: string): string | undefined;
  all(name: string): string[];
  has(name: string): boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error(`unexpected positional argument: ${token}`);
    const name = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values.set(name, [...(values.get(name) ?? []), "true"]);
      continue;
    }
    values.set(name, [...(values.get(name) ?? []), next]);
    index += 1;
  }
  return {
    first: (name) => values.get(name)?.[0],
    all: (name) => values.get(name) ?? [],
    has: (name) => values.has(name),
  };
}

function required(args: ParsedArgs, name: string): string {
  const value = args.first(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "learned-capability";
}

function usage(): void {
  console.log(`Byheart\n\nPrimary discovery path (Codex/external agent):\n  node dist/src/cli.js teach --url http://127.0.0.1:4173 --goal "Stage an order for 25 supplies at ASH-17" --success-text "ORDER STAGED" --parameter market=ASH-17 --parameter quantity=25 --output runtime/stage-order.json\n\nA successful teach automatically writes a sibling durability candidate. Real replays against distinct inputs update that candidate. Once verified, promote it into a repository-local skill wrapper:\n  node dist/src/cli.js promote --candidate runtime/stage-order.candidate.json\n\nDeterministic replay:\n  node dist/src/cli.js replay --capability runtime/stage-order.json --input market=VES-04 --input quantity=10 --operator --headed\n\nOptional self-contained API discovery:\n  node dist/src/cli.js teach-api --url http://127.0.0.1:4173 --goal "..." --success-text "ORDER STAGED" --parameter market=ASH-17 --parameter quantity=25 --model <model>\n\nCommon teach options:\n  --driver codex --max-steps 30 --known-outcome market_not_found=NO SUCH MARKET --headed\n`);
}

void ({} as Record<string, JsonValue>);
