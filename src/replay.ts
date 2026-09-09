import { randomUUID } from "node:crypto";
import { inputContext, validateCapability, validateInputs } from "./artifact.js";
import { toJsonObject } from "./json.js";
import { evaluatePolicy } from "./policy.js";
import { OwnershipController } from "./session.js";
import { renderObject } from "./template.js";
import type {
  Capability,
  CapabilityStep,
  CheckReceipt,
  Condition,
  EvidenceSink,
  JsonValue,
  KnownOutcomeResult,
  ReplayResult,
  Surface,
} from "./types.js";

export interface ReplayOptions {
  runId?: string;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export class ReplayEngine {
  private readonly runId: string;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly ownership: OwnershipController;
  private startedAt = "";

  constructor(
    private readonly surface: Surface,
    private readonly evidence: EvidenceSink,
    options: ReplayOptions = {},
  ) {
    this.runId = options.runId ?? randomUUID();
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.ownership = new OwnershipController(surface);
  }

  async run(capability: Capability, inputs: Record<string, JsonValue>): Promise<ReplayResult> {
    this.startedAt = this.timestamp();
    try {
      validateCapability(capability);
    } catch (error) {
      return this.failure(capability, "internal", String(error));
    }

    const inputProblems = validateInputs(capability.inputs, inputs);
    if (inputProblems.length) {
      return this.failure(capability, "invalid_input", inputProblems.join("; "));
    }

    const identity = await this.surface.identity();
    if (identity.adapter !== capability.target.adapter) {
      return this.failure(
        capability,
        "surface_changed",
        `expected adapter ${capability.target.adapter}; observed ${identity.adapter}`,
      );
    }

    await this.evidence.record({
      at: this.timestamp(),
      runId: this.runId,
      kind: "run_started",
      data: {
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        adapter: identity.adapter,
        sessionId: identity.sessionId,
      },
    });

    const context = inputContext(inputs);

    for (const rawStep of capability.steps) {
      const step = renderObject(rawStep, context);
      const result = await this.runStep(capability, step);
      if (result) return result;
    }

    for (const rawCondition of capability.success) {
      const condition = renderObject(rawCondition, context);
      const check = await this.surface.check(condition);
      await this.recordCheck("success", check);
      if (!check.passed) {
        return this.failure(
          capability,
          "checkpoint_failed",
          check.detail ?? "final success checkpoint failed",
          undefined,
          JSON.stringify(condition),
          check.observed === undefined ? undefined : JSON.stringify(check.observed),
        );
      }
    }

    const outputs: Record<string, JsonValue> = {};
    for (const rawRule of capability.extraction ?? []) {
      const rule = renderObject(rawRule, context);
      outputs[rule.output] = await this.surface.extract(rule);
    }

    await this.ownership.complete();
    const result: ReplayResult = {
      status: "success",
      runId: this.runId,
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      startedAt: this.startedAt,
      finishedAt: this.timestamp(),
      outputs,
      evidence: this.evidence.refs(),
    };
    await this.finish(result);
    return result;
  }

  private async runStep(
    capability: Capability,
    step: CapabilityStep,
  ): Promise<ReplayResult | undefined> {
    await this.evidence.record({
      at: this.timestamp(),
      runId: this.runId,
      kind: "step_started",
      data: { stepId: step.id, action: toJsonObject(step.action) },
    });

    for (const condition of step.before ?? []) {
      const check = await this.surface.check(condition);
      await this.recordCheck(step.id, check);
      if (!check.passed) {
        return this.failure(
          capability,
          "precondition_failed",
          check.detail ?? "step precondition failed",
          step.id,
          JSON.stringify(condition),
          check.observed === undefined ? undefined : JSON.stringify(check.observed),
        );
      }
    }

    const identity = await this.surface.identity();
    const policy = evaluatePolicy(capability.policy, identity, step.action);
    if (policy.decision === "deny") {
      return this.failure(capability, "policy_denied", policy.reason, step.id);
    }
    if (policy.decision === "require_human") {
      await this.ownership.pauseForReview();
      await this.evidence.record({
        at: this.timestamp(),
        runId: this.runId,
        kind: "human_handoff",
        data: { stepId: step.id, reason: policy.reason, ownership: this.ownership.state() },
      });
      const result: ReplayResult = {
        status: "intervention_required",
        runId: this.runId,
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        startedAt: this.startedAt,
        finishedAt: this.timestamp(),
        reason: policy.reason,
        stepId: step.id,
        ownership: this.ownership.state(),
        session: identity,
        evidence: this.evidence.refs(),
      };
      await this.finish(result);
      return result;
    }

    const attempts = Math.max(1, step.retry?.maxAttempts ?? 1);
    let lastFailure = "action did not produce the expected effect";

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const receipt = await this.surface.act(step.action);
      await this.evidence.record({
        at: this.timestamp(),
        runId: this.runId,
        kind: "action_receipt",
        data: {
          stepId: step.id,
          attempt,
          delivered: receipt.delivered,
          effectObserved: receipt.effectObserved,
          detail: receipt.detail ?? "",
        },
      });

      const known = await this.matchKnownOutcome(capability, step);
      if (known) return known;

      const afterChecks = await this.checkAll(step.id, step.after ?? []);
      if (receipt.delivered && receipt.effectObserved && afterChecks.every((check) => check.passed)) {
        return undefined;
      }

      lastFailure = receipt.detail ?? lastFailure;
      const recovered = await this.tryRecovery(capability, step);
      if (recovered instanceof Object && "status" in recovered) return recovered;

      if (attempt < attempts) {
        await this.sleep(step.retry?.backoffMs ?? 0);
      }
    }

    return this.failure(capability, "action_failed", lastFailure, step.id);
  }

  private async matchKnownOutcome(
    capability: Capability,
    step: CapabilityStep,
  ): Promise<KnownOutcomeResult | undefined> {
    for (const rule of step.knownOutcomes ?? []) {
      const check = await this.surface.check(rule.when);
      await this.recordCheck(`${step.id}:known:${rule.code}`, check);
      if (!check.passed) continue;
      const result: KnownOutcomeResult = {
        status: "known_outcome",
        runId: this.runId,
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        startedAt: this.startedAt,
        finishedAt: this.timestamp(),
        code: rule.code,
        stepId: step.id,
        ...(rule.detail ? { detail: rule.detail } : {}),
        evidence: this.evidence.refs(),
      };
      await this.finish(result);
      return result;
    }
    return undefined;
  }

  private async tryRecovery(
    capability: Capability,
    step: CapabilityStep,
  ): Promise<ReplayResult | boolean> {
    for (const recovery of step.recoveries ?? []) {
      const applies = await this.surface.check(recovery.when);
      await this.recordCheck(`${step.id}:recovery`, applies);
      if (!applies.passed) continue;

      await this.evidence.record({
        at: this.timestamp(),
        runId: this.runId,
        kind: "recovery",
        data: { stepId: step.id, actions: recovery.actions.length },
      });

      for (const action of recovery.actions) {
        const identity = await this.surface.identity();
        const policy = evaluatePolicy(capability.policy, identity, action);
        if (policy.decision === "deny") {
          return this.failure(capability, "policy_denied", policy.reason, step.id);
        }
        if (policy.decision === "require_human") {
          await this.ownership.pauseForReview();
          const result: ReplayResult = {
            status: "intervention_required",
            runId: this.runId,
            capabilityId: capability.id,
            capabilityVersion: capability.version,
            startedAt: this.startedAt,
            finishedAt: this.timestamp(),
            reason: policy.reason,
            stepId: step.id,
            ownership: this.ownership.state(),
            session: identity,
            evidence: this.evidence.refs(),
          };
          await this.finish(result);
          return result;
        }
        await this.surface.act(action);
      }
      return true;
    }
    return false;
  }

  private async checkAll(label: string, conditions: Condition[]): Promise<CheckReceipt[]> {
    const checks: CheckReceipt[] = [];
    for (const condition of conditions) {
      const check = await this.surface.check(condition);
      await this.recordCheck(label, check);
      checks.push(check);
    }
    return checks;
  }

  private async recordCheck(label: string, check: CheckReceipt): Promise<void> {
    await this.evidence.record({
      at: this.timestamp(),
      runId: this.runId,
      kind: "check",
      data: {
        label,
        passed: check.passed,
        detail: check.detail ?? "",
        condition: toJsonObject(check.condition),
      },
    });
  }

  private failure(
    capability: Capability,
    classification: Extract<ReplayResult, { status: "failure" }>["class"],
    detail: string,
    stepId?: string,
    expected?: string,
    observed?: string,
  ): ReplayResult {
    return {
      status: "failure",
      runId: this.runId,
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      startedAt: this.startedAt || this.timestamp(),
      finishedAt: this.timestamp(),
      class: classification,
      detail,
      ...(stepId ? { stepId } : {}),
      ...(expected ? { expected } : {}),
      ...(observed ? { observed } : {}),
      evidence: this.evidence.refs(),
    };
  }

  private async finish(result: ReplayResult): Promise<void> {
    await this.evidence.record({
      at: this.timestamp(),
      runId: this.runId,
      kind: "run_finished",
      data: { status: result.status },
    });
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
