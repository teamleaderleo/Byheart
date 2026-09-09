import { randomUUID } from "node:crypto";
import { validateInputs } from "./artifact.js";
import { CapabilityCatalog, type CapabilityReference } from "./catalog.js";
import { ReplayEngine } from "./replay.js";
import { renderObject, resolvePath } from "./template.js";
import type {
  EvidenceRef,
  EvidenceSink,
  JsonObject,
  JsonValue,
  ReplayResult,
  ScalarType,
  Surface,
  ValueSchema,
} from "./types.js";

export interface CapabilityPlanStep {
  id: string;
  capability: CapabilityReference;
  inputs: JsonObject;
}

export interface PlanOutputRule {
  from: string;
  as: ScalarType;
}

export interface CapabilityPlan {
  format: "byheart-plan/v1";
  id: string;
  name: string;
  version: number;
  description?: string;
  inputs: Record<string, ValueSchema>;
  outputs: Record<string, ValueSchema>;
  steps: CapabilityPlanStep[];
  extraction: Record<string, PlanOutputRule>;
}

export interface PlanStepResult {
  stepId: string;
  capabilityId: string;
  capabilityVersion: number;
  result: ReplayResult;
}

interface PlanBaseResult {
  planRunId: string;
  planId: string;
  planVersion: number;
  startedAt: string;
  finishedAt: string;
  steps: PlanStepResult[];
  evidence: EvidenceRef[];
}

export interface PlanSuccessResult extends PlanBaseResult {
  status: "success";
  outputs: Record<string, JsonValue>;
}

export interface PlanKnownOutcomeResult extends PlanBaseResult {
  status: "known_outcome";
  stepId: string;
  code: string;
  child: Extract<ReplayResult, { status: "known_outcome" }>;
}

export interface PlanFailureResult extends PlanBaseResult {
  status: "failure";
  stepId: string;
  child: Extract<ReplayResult, { status: "failure" }>;
}

export interface PlanInterventionResult extends PlanBaseResult {
  status: "intervention_required";
  stepId: string;
  child: Extract<ReplayResult, { status: "intervention_required" }>;
}

export type CapabilityPlanResult =
  | PlanSuccessResult
  | PlanKnownOutcomeResult
  | PlanFailureResult
  | PlanInterventionResult;

export interface PlanExecutorOptions {
  runId?: string;
  now?: () => Date;
}

/**
 * Executes a higher-level plan by invoking saved capabilities on the same live
 * surface. The plan itself contains no model loop. Outputs from earlier skills
 * become template inputs for later skills under `steps.<id>.outputs.*`.
 */
export class CapabilityPlanExecutor {
  private readonly runId: string;
  private readonly now: () => Date;

  constructor(
    private readonly surface: Surface,
    private readonly evidence: EvidenceSink,
    private readonly catalog: CapabilityCatalog,
    options: PlanExecutorOptions = {},
  ) {
    this.runId = options.runId ?? randomUUID();
    this.now = options.now ?? (() => new Date());
  }

  async run(plan: CapabilityPlan, inputs: Record<string, JsonValue>): Promise<CapabilityPlanResult> {
    validatePlan(plan, this.catalog);
    const problems = validateInputs(plan.inputs, inputs);
    const startedAt = this.now().toISOString();
    const stepResults: PlanStepResult[] = [];
    if (problems.length) {
      return {
        status: "failure",
        planRunId: this.runId,
        planId: plan.id,
        planVersion: plan.version,
        startedAt,
        finishedAt: this.now().toISOString(),
        stepId: "plan-inputs",
        child: syntheticFailure(this.runId, plan.id, problems.join("; ")),
        steps: stepResults,
        evidence: this.evidence.refs(),
      };
    }

    const context: JsonObject = { input: inputs, steps: {} };

    for (const planStep of plan.steps) {
      const capability = this.catalog.get(planStep.capability);
      const renderedInputs = renderObject(planStep.inputs, context);
      const engine = new ReplayEngine(this.surface, this.evidence, {
        runId: `${this.runId}:${planStep.id}`,
        now: this.now,
      });
      const result = await engine.run(capability, renderedInputs);
      stepResults.push({
        stepId: planStep.id,
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        result,
      });

      if (result.status !== "success") {
        return terminalResult(plan, this.runId, startedAt, planStep.id, result, stepResults, this.evidence.refs(), this.now());
      }

      const steps = context.steps as JsonObject;
      steps[planStep.id] = {
        status: result.status,
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        outputs: result.outputs,
      };
    }

    const outputs: Record<string, JsonValue> = {};
    for (const [name, rule] of Object.entries(plan.extraction)) {
      const value = resolvePath(context, rule.from);
      if (value === undefined) throw new Error(`plan output ${name} path missing: ${rule.from}`);
      outputs[name] = coerce(value, rule.as);
    }

    return {
      status: "success",
      planRunId: this.runId,
      planId: plan.id,
      planVersion: plan.version,
      startedAt,
      finishedAt: this.now().toISOString(),
      outputs,
      steps: stepResults,
      evidence: this.evidence.refs(),
    };
  }
}

export function validatePlan(plan: CapabilityPlan, catalog: CapabilityCatalog): void {
  const problems: string[] = [];
  if (plan.format !== "byheart-plan/v1") problems.push("unsupported plan format");
  if (!plan.id.trim()) problems.push("plan id is required");
  if (!plan.name.trim()) problems.push("plan name is required");
  if (!Number.isInteger(plan.version) || plan.version < 1) problems.push("plan version must be a positive integer");
  if (plan.steps.length === 0) problems.push("plan needs at least one capability step");

  const ids = new Set<string>();
  for (const step of plan.steps) {
    if (!step.id.trim()) problems.push("every plan step needs an id");
    if (ids.has(step.id)) problems.push(`duplicate plan step id: ${step.id}`);
    ids.add(step.id);
    if (!catalog.has(step.capability)) {
      problems.push(`unknown capability reference: ${step.capability.id}${step.capability.version ? `@${step.capability.version}` : ""}`);
    }
  }

  for (const output of Object.keys(plan.outputs)) {
    if (!(output in plan.extraction)) problems.push(`plan output ${output} has no extraction rule`);
  }
  for (const output of Object.keys(plan.extraction)) {
    if (!(output in plan.outputs)) problems.push(`plan extraction references undeclared output: ${output}`);
  }

  if (problems.length) throw new Error(`Invalid plan:\n- ${problems.join("\n- ")}`);
}

function terminalResult(
  plan: CapabilityPlan,
  runId: string,
  startedAt: string,
  stepId: string,
  child: Exclude<ReplayResult, { status: "success" }>,
  steps: PlanStepResult[],
  evidence: EvidenceRef[],
  now: Date,
): CapabilityPlanResult {
  const base = {
    planRunId: runId,
    planId: plan.id,
    planVersion: plan.version,
    startedAt,
    finishedAt: now.toISOString(),
    stepId,
    steps,
    evidence,
  };
  switch (child.status) {
    case "known_outcome":
      return { ...base, status: "known_outcome", code: child.code, child };
    case "failure":
      return { ...base, status: "failure", child };
    case "intervention_required":
      return { ...base, status: "intervention_required", child };
  }
}

function coerce(value: JsonValue, type: ScalarType): JsonValue {
  if (value === null || typeof value === "object") throw new Error(`cannot coerce complex plan output to ${type}`);
  if (type === "string") return String(value);
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`cannot coerce ${String(value)} to number`);
    return parsed;
  }
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`cannot coerce ${String(value)} to boolean`);
}

function syntheticFailure(runId: string, capabilityId: string, detail: string): Extract<ReplayResult, { status: "failure" }> {
  const at = new Date().toISOString();
  return {
    status: "failure",
    runId: `${runId}:plan-inputs`,
    capabilityId,
    capabilityVersion: 1,
    startedAt: at,
    finishedAt: at,
    class: "invalid_input",
    detail,
    evidence: [],
  };
}
