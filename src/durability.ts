import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type {
  Capability,
  DiscoveryTrace,
  JsonObject,
  JsonValue,
  ReplayResult,
  ValueSchema,
} from "./types.js";

export type DurableRepresentation =
  | "capability"
  | "plan"
  | "helper"
  | "script"
  | "instruction"
  | "semantic_action"
  | "recovery"
  | "policy";

export type DurabilityStatus = "candidate" | "verified" | "promoted" | "needs_review" | "rejected";

export interface DurabilityVerificationAttempt {
  at: string;
  invocationHash: string;
  status: ReplayResult["status"];
  runId: string;
  detail?: string;
}

export interface DurabilityCandidate {
  format: "byheart-durability-candidate/v1";
  id: string;
  capability: {
    id: string;
    version: number;
    artifactPath: string;
  };
  source: {
    kind: "discovery" | "manual";
    runId?: string;
    goal: string;
    driver?: string;
    evidence: string[];
  };
  proposed: {
    primary: DurableRepresentation;
    alternatives: DurableRepresentation[];
    reason: string;
  };
  applicability: {
    adapter: string;
    entrypoint?: string;
    inputs: Record<string, ValueSchema>;
    outputs: Record<string, ValueSchema>;
  };
  signals: {
    steps: number;
    actionKinds: Record<string, number>;
    brittleTargets: number;
    unsuccessfulActions: number;
    repeatedActionSignatures: string[];
  };
  verification: {
    requiredDistinctSuccesses: number;
    attempts: DurabilityVerificationAttempt[];
  };
  status: DurabilityStatus;
  createdAt: string;
  updatedAt: string;
  promotedAt?: string;
  promotedPath?: string;
  notes: string[];
}

export interface CreateDurabilityCandidateOptions {
  artifactPath: string;
  requiredDistinctSuccesses?: number;
}

/**
 * Turn a successful discovery into a low-ceremony durability candidate.
 * The capability is already the first durable representation; the packet also
 * highlights reasons Codex may want to collapse it further into a helper,
 * semantic action, recovery, or higher-level composition.
 */
export function candidateFromDiscovery(
  trace: DiscoveryTrace,
  capability: Capability,
  options: CreateDurabilityCandidateOptions,
): DurabilityCandidate {
  const actionKinds: Record<string, number> = {};
  const signatures = new Map<string, number>();
  let brittleTargets = 0;
  let unsuccessfulActions = 0;

  for (const entry of trace.entries) {
    actionKinds[entry.action.kind] = (actionKinds[entry.action.kind] ?? 0) + 1;
    if (!entry.receipt.delivered || !entry.receipt.effectObserved) unsuccessfulActions += 1;
    if ("target" in entry.action) {
      const target = entry.action.target;
      if (target.kind === "point" || target.kind === "selector") brittleTargets += 1;
    }
    const signature = actionSignature(entry.action);
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }

  const repeatedActionSignatures = [...signatures.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([signature, count]) => `${signature} ×${count}`);

  const alternatives: DurableRepresentation[] = [];
  if (repeatedActionSignatures.length > 0) alternatives.push("helper");
  if ((actionKinds.semantic ?? 0) > 0) alternatives.push("semantic_action");
  if (capability.steps.some((step) => (step.recoveries?.length ?? 0) > 0)) alternatives.push("recovery");
  if (capability.steps.length >= 6) alternatives.push("plan");
  alternatives.push("instruction");

  const now = new Date().toISOString();
  return {
    format: "byheart-durability-candidate/v1",
    id: `${capability.id}@${capability.version}`,
    capability: {
      id: capability.id,
      version: capability.version,
      artifactPath: resolve(options.artifactPath),
    },
    source: {
      kind: "discovery",
      runId: trace.runId,
      goal: trace.goal,
      ...(capability.provenance?.model ? { driver: capability.provenance.model } : {}),
      evidence: capability.provenance?.evidence ?? [],
    },
    proposed: {
      primary: "capability",
      alternatives: unique(alternatives),
      reason: "The successful trace has already been compiled into deterministic replay. Verify it on distinct inputs, then keep it or collapse stable sub-work into a cheaper durable form.",
    },
    applicability: {
      adapter: capability.target.adapter,
      ...(capability.target.entrypoint ? { entrypoint: capability.target.entrypoint } : {}),
      inputs: structuredClone(capability.inputs),
      outputs: structuredClone(capability.outputs),
    },
    signals: {
      steps: capability.steps.length,
      actionKinds,
      brittleTargets,
      unsuccessfulActions,
      repeatedActionSignatures,
    },
    verification: {
      requiredDistinctSuccesses: options.requiredDistinctSuccesses ?? 2,
      attempts: [],
    },
    status: "candidate",
    createdAt: now,
    updatedAt: now,
    notes: durabilityQuestions(capability, brittleTargets, repeatedActionSignatures.length),
  };
}

export function candidatePathForCapability(capabilityPath: string): string {
  const extension = extname(capabilityPath);
  return extension
    ? capabilityPath.slice(0, -extension.length) + ".candidate.json"
    : capabilityPath + ".candidate.json";
}

export async function readCandidate(path: string): Promise<DurabilityCandidate> {
  const candidate = JSON.parse(await readFile(path, "utf8")) as DurabilityCandidate;
  validateCandidate(candidate);
  return candidate;
}

export async function writeCandidate(path: string, candidate: DurabilityCandidate): Promise<void> {
  validateCandidate(candidate);
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, JSON.stringify(candidate, null, 2) + "\n", "utf8");
}

/** Record a real replay against a candidate. No model judgment is involved. */
export function recordVerification(
  candidate: DurabilityCandidate,
  result: ReplayResult,
  inputs: Record<string, JsonValue>,
): DurabilityCandidate {
  const updated = structuredClone(candidate);
  const attempt: DurabilityVerificationAttempt = {
    at: new Date().toISOString(),
    invocationHash: hashInvocation(inputs),
    status: result.status,
    runId: result.runId,
    ...(result.status === "failure" ? { detail: result.detail } : {}),
  };
  updated.verification.attempts.push(attempt);

  const failures = updated.verification.attempts.filter((item) => item.status === "failure");
  const distinctSuccesses = new Set(
    updated.verification.attempts
      .filter((item) => item.status === "success")
      .map((item) => item.invocationHash),
  ).size;

  if (failures.length > 0) updated.status = "needs_review";
  else if (distinctSuccesses >= updated.verification.requiredDistinctSuccesses) updated.status = "verified";
  else if (updated.status !== "promoted" && updated.status !== "rejected") updated.status = "candidate";
  updated.updatedAt = new Date().toISOString();
  return updated;
}

export interface PromoteCandidateOptions {
  candidatePath: string;
  skillsDirectory?: string;
}

export interface PromotionResult {
  skillDirectory: string;
  skillMarkdown: string;
  capabilityPath: string;
  indexPath: string;
  candidate: DurabilityCandidate;
}

/**
 * Promote a verified capability into a repository-local skill wrapper that is
 * immediately legible to Codex. The wrapper keeps deterministic replay as the
 * implementation and tells the agent when to fall back to exploration.
 */
export async function promoteCandidate(options: PromoteCandidateOptions): Promise<PromotionResult> {
  const candidatePath = resolve(options.candidatePath);
  const candidate = await readCandidate(candidatePath);
  if (candidate.status !== "verified" && candidate.status !== "promoted") {
    throw new Error(`candidate ${candidate.id} is ${candidate.status}; verify it before promotion`);
  }

  const capability = JSON.parse(await readFile(candidate.capability.artifactPath, "utf8")) as Capability;
  if (capability.id !== candidate.capability.id || capability.version !== candidate.capability.version) {
    throw new Error("candidate capability identity does not match artifact");
  }

  const root = resolve(options.skillsDirectory ?? ".byheart/skills");
  const skillDirectory = resolve(root, safeSegment(capability.id), `v${capability.version}`);
  await mkdir(skillDirectory, { recursive: true });
  const promotedCapabilityPath = resolve(skillDirectory, "capability.json");
  const skillMarkdown = resolve(skillDirectory, "SKILL.md");
  await copyFile(candidate.capability.artifactPath, promotedCapabilityPath);
  await writeFile(skillMarkdown, renderSkill(capability, promotedCapabilityPath), "utf8");

  const indexPath = resolve(root, "index.json");
  const index = await readIndex(indexPath);
  const withoutSame = index.skills.filter((item) => !(item.id === capability.id && item.version === capability.version));
  withoutSame.push({
    id: capability.id,
    version: capability.version,
    name: capability.name,
    description: capability.description ?? capability.name,
    adapter: capability.target.adapter,
    skill: relativePortable(root, skillMarkdown),
    capability: relativePortable(root, promotedCapabilityPath),
  });
  withoutSame.sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version);
  await writeFile(indexPath, JSON.stringify({ format: "byheart-skill-index/v1", skills: withoutSame }, null, 2) + "\n", "utf8");

  const promoted = structuredClone(candidate);
  promoted.status = "promoted";
  promoted.promotedAt = new Date().toISOString();
  promoted.promotedPath = skillDirectory;
  promoted.updatedAt = promoted.promotedAt;
  await writeCandidate(candidatePath, promoted);

  return {
    skillDirectory,
    skillMarkdown,
    capabilityPath: promotedCapabilityPath,
    indexPath,
    candidate: promoted,
  };
}

export function renderDurabilityMemo(candidate: DurabilityCandidate): string {
  const successes = candidate.verification.attempts.filter((attempt) => attempt.status === "success");
  const distinctSuccesses = new Set(successes.map((attempt) => attempt.invocationHash)).size;
  return [
    `# Durability candidate: ${candidate.id}`,
    "",
    `Status: **${candidate.status}**`,
    "",
    candidate.source.goal,
    "",
    "## Current durable form",
    "",
    `${candidate.proposed.primary}: ${candidate.proposed.reason}`,
    "",
    `Steps: ${candidate.signals.steps}; brittle point/selector targets: ${candidate.signals.brittleTargets}; unsuccessful discovery actions: ${candidate.signals.unsuccessfulActions}.`,
    "",
    `Verification: ${distinctSuccesses}/${candidate.verification.requiredDistinctSuccesses} distinct successful invocations.`,
    "",
    "## Before calling this finished",
    "",
    ...candidate.notes.map((note) => `- ${note}`),
    "",
    "If a smaller helper, script, semantic action, or instruction can replace part of the trace cleanly, prefer that and keep the evidence linking it back to the successful run.",
    "",
  ].join("\n");
}

function validateCandidate(candidate: DurabilityCandidate): void {
  if (candidate.format !== "byheart-durability-candidate/v1") throw new Error("unsupported durability candidate format");
  if (!candidate.id || !candidate.capability?.id || !candidate.capability?.artifactPath) throw new Error("durability candidate identity is incomplete");
  if (!Number.isInteger(candidate.capability.version) || candidate.capability.version < 1) throw new Error("durability candidate version is invalid");
  if (!Number.isInteger(candidate.verification.requiredDistinctSuccesses) || candidate.verification.requiredDistinctSuccesses < 1) {
    throw new Error("durability candidate verification threshold must be positive");
  }
}

function actionSignature(action: DiscoveryTrace["entries"][number]["action"]): string {
  switch (action.kind) {
    case "click":
    case "type":
    case "select":
    case "read":
      return `${action.kind}:${JSON.stringify(action.target)}`;
    case "navigate":
      return `navigate:${action.url}`;
    case "wait":
      return `wait:${JSON.stringify(action.condition)}`;
    case "semantic":
      return `semantic:${action.name}`;
  }
}

function durabilityQuestions(capability: Capability, brittleTargets: number, repeated: number): string[] {
  const notes = [
    "Can any part of the successful work be replaced by a smaller deterministic helper or command instead of preserving UI choreography?",
    "Are the capability inputs broad enough for the next real variation without hiding app-specific assumptions?",
    "What exact failure should send Codex back to exploration instead of retrying blindly?",
  ];
  if (brittleTargets > 0) notes.push("Replace point/selector targets with semantic identity when the target offers one, or bind them to an explicit compatibility fingerprint.");
  if (repeated > 0) notes.push("Repeated action motifs may deserve their own helper/sub-capability if they recur across tasks.");
  if (capability.steps.length >= 6) notes.push("Consider whether this is already several meaningful skills composed in sequence instead of one monolithic capability.");
  return notes;
}

function hashInvocation(inputs: Record<string, JsonValue>): string {
  return createHash("sha256").update(stableJson(inputs)).digest("hex").slice(0, 24);
}

function stableJson(value: JsonValue | Record<string, JsonValue>): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const object = value as Record<string, JsonValue>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key]!)}`).join(",")}}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "skill";
}

function renderSkill(capability: Capability, promotedPath: string): string {
  const inputLines = Object.entries(capability.inputs).map(([name, schema]) => `- \`${name}\` (${schema.type}${schema.required === false ? ", optional" : ""}): ${schema.description ?? "invocation input"}`);
  const outputLines = Object.entries(capability.outputs).map(([name, schema]) => `- \`${name}\` (${schema.type}): ${schema.description ?? "declared output"}`);
  const args = Object.keys(capability.inputs).map((name) => `--input ${name}=<${name}>`).join(" ");
  return [
    `# ${capability.name}`,
    "",
    capability.description ?? `Deterministic Byheart capability ${capability.id}.`,
    "",
    "## Use when",
    "",
    `Use this when the task matches capability \`${capability.id}@${capability.version}\` on adapter \`${capability.target.adapter}\`${capability.target.entrypoint ? ` at ${capability.target.entrypoint}` : ""}.`,
    "",
    "Prefer this deterministic path before rediscovering the same procedure. If compatibility/preconditions fail, inspect the evidence and return to normal Codex exploration; do not force the old path.",
    "",
    "## Inputs",
    "",
    ...(inputLines.length ? inputLines : ["- none"]),
    "",
    "## Outputs",
    "",
    ...(outputLines.length ? outputLines : ["- none"]),
    "",
    "## Invoke",
    "",
    "```bash",
    `npm run byheart -- replay --capability ${portable(promotedPath)}${args ? ` ${args}` : ""}`,
    "```",
    "",
    "## Failure rule",
    "",
    "A known outcome is a legitimate result. A failure or intervention result means the deterministic proof stopped holding; inspect the run evidence and use judgment. If the repair is reusable, update the capability or add a narrower helper and verify it before relying on it.",
    "",
  ].join("\n");
}

interface SkillIndexEntry {
  id: string;
  version: number;
  name: string;
  description: string;
  adapter: string;
  skill: string;
  capability: string;
}

async function readIndex(path: string): Promise<{ format: "byheart-skill-index/v1"; skills: SkillIndexEntry[] }> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as { format?: string; skills?: SkillIndexEntry[] };
    if (value.format !== "byheart-skill-index/v1" || !Array.isArray(value.skills)) throw new Error("invalid skill index");
    return { format: "byheart-skill-index/v1", skills: value.skills };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { format: "byheart-skill-index/v1", skills: [] };
    throw error;
  }
}

function relativePortable(root: string, path: string): string {
  const normalizedRoot = resolve(root).replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPath = resolve(path).replace(/\\/g, "/");
  return normalizedPath.startsWith(`${normalizedRoot}/`) ? normalizedPath.slice(normalizedRoot.length + 1) : normalizedPath;
}

function portable(path: string): string {
  const cwd = resolve(process.cwd()).replace(/\\/g, "/").replace(/\/+$/, "");
  const normalized = resolve(path).replace(/\\/g, "/");
  return normalized.startsWith(`${cwd}/`) ? normalized.slice(cwd.length + 1) : normalized;
}

void basename;
void ({} as JsonObject);
