#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { compileTrace } from "./compiler.js";
import { DiscoveryRunner } from "./discovery.js";
import { FileEvidenceSink } from "./evidence-file.js";
import { OpenAIDecisionModel } from "./models/openai.js";
import { OperatorGate } from "./operator.js";
import { PlaywrightSurface } from "./adapters/playwright.js";
import { ReplayEngine } from "./replay.js";
import type {
  Capability,
  JsonPrimitive,
  JsonValue,
  KnownOutcomeRule,
  ValueSchema,
} from "./types.js";

const [command, ...argv] = process.argv.slice(2);

try {
  switch (command) {
    case "teach":
      await teach(argv);
      break;
    case "replay":
      await replay(argv);
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

async function teach(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const url = required(args, "url");
  const goal = required(args, "goal");
  const successText = required(args, "success-text");
  const name = args.first("name") ?? "learned-capability";
  const id = args.first("id") ?? slug(name);
  const output = resolve(args.first("output") ?? `runtime/${id}.json`);
  const runDirectory = resolve(args.first("run-dir") ?? `runtime/discovery-${Date.now()}`);
  const headed = args.has("headed");
  const parameters = parseAssignments(args.all("parameter"));
  const knownOutcomes = parseKnownOutcomes(args.all("known-outcome"));

  await mkdir(runDirectory, { recursive: true });
  await mkdir(resolve(output, ".."), { recursive: true });

  const evidence = new FileEvidenceSink(runDirectory, "discovery.jsonl");
  const surface = await PlaywrightSurface.launch({
    entrypoint: url,
    headless: !headed,
    artifactDir: resolve(runDirectory, "screenshots"),
  });

  try {
    const model = new OpenAIDecisionModel({
      ...(args.first("model") ? { model: args.first("model")! } : {}),
      reasoningEffort: (args.first("reasoning") as "none" | "low" | "medium" | "high" | undefined) ?? "low",
    });
    const runner = new DiscoveryRunner(surface, model, evidence);
    const trace = await runner.run(goal, { adapter: "browser", entrypoint: url }, {
      maxSteps: Number(args.first("max-steps") ?? 30),
      allowedActions: ["navigate", "click", "type", "select", "wait"],
      consequentialPolicy: "require_human",
    });

    const inputSchemas: Record<string, ValueSchema> = Object.fromEntries(
      Object.keys(parameters).map((parameter) => [parameter, { type: "string" }]),
    );
    const parameterize: Record<string, JsonPrimitive> = parameters;
    const capability = compileTrace(trace, {
      id,
      name,
      description: goal,
      inputs: inputSchemas,
      outputs: {},
      success: [{ kind: "text_present", text: successText }],
      parameterize,
      model: model.id,
      policy: {
        allowedAdapters: ["browser"],
        allowedEntrypoints: [url],
        consequentialPolicy: "require_human",
      },
    });

    hardenCompiledCapability(capability, knownOutcomes);
    capability.provenance = {
      ...capability.provenance,
      evidence: evidence.refs().map((item) => item.uri),
    };

    await writeFile(output, JSON.stringify(capability, null, 2) + "\n", "utf8");
    await writeFile(resolve(runDirectory, "trace.json"), JSON.stringify(trace, null, 2) + "\n", "utf8");
    await surface.captureEvidence?.("discovery-final");

    console.log(`Learned ${capability.name}`);
    console.log(`Artifact: ${output}`);
    console.log(`Evidence: ${runDirectory}`);
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
    console.log(JSON.stringify(result, null, 2));
    console.log(`Evidence: ${runDirectory}`);
  } finally {
    await operator?.close();
    await surface.close();
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
  console.log(`Byheart\n\nTeach a browser task:\n  node dist/src/cli.js teach --url http://127.0.0.1:4173 --goal "..." --success-text "ORDER STAGED" --parameter market=ASH-17 --parameter quantity=25 --output runtime/stage-order.json\n\nReplay a saved capability:\n  node dist/src/cli.js replay --capability runtime/stage-order.json --input market=VES-04 --input quantity=10 --operator --headed\n\nCommon teach options:\n  --model <model> --reasoning low --max-steps 30 --known-outcome market_not_found=NO SUCH MARKET --headed\n`);
}

void ({} as Record<string, JsonValue>);
