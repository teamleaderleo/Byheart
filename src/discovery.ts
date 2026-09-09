import { randomUUID } from "node:crypto";
import { toJsonObject } from "./json.js";
import { evaluatePolicy } from "./policy.js";
import type {
  ActionKind,
  CapabilityPolicy,
  DecisionModel,
  DiscoveryTrace,
  EvidenceSink,
  Surface,
  SurfaceTarget,
} from "./types.js";

export interface DiscoveryOptions {
  maxSteps?: number;
  allowedActions: ActionKind[];
  consequentialPolicy?: "block" | "require_human" | "allow";
  now?: () => Date;
}

export class DiscoveryRunner {
  constructor(
    private readonly surface: Surface,
    private readonly model: DecisionModel,
    private readonly evidence: EvidenceSink,
  ) {}

  async run(goal: string, target: SurfaceTarget, options: DiscoveryOptions): Promise<DiscoveryTrace> {
    const runId = randomUUID();
    const now = options.now ?? (() => new Date());
    const maxSteps = options.maxSteps ?? 30;
    const trace: DiscoveryTrace = {
      runId,
      goal,
      target,
      startedAt: now().toISOString(),
      entries: [],
    };

    const identity = await this.surface.identity();
    const policy: CapabilityPolicy = {
      allowedAdapters: [target.adapter],
      allowedActions: options.allowedActions,
      ...(target.entrypoint ? { allowedEntrypoints: [target.entrypoint] } : {}),
      consequentialPolicy: options.consequentialPolicy ?? "require_human",
    };

    for (let step = 1; step <= maxSteps; step += 1) {
      const observation = await this.surface.observe();
      const decision = await this.model.decide({
        goal,
        target,
        observation,
        trace: trace.entries,
        allowedActions: options.allowedActions,
      });

      await this.evidence.record({
        at: now().toISOString(),
        runId,
        kind: "discovery_decision",
        data: { step, decision: toJsonObject(decision), model: this.model.id },
      });

      if (decision.kind === "done") {
        trace.finishedAt = now().toISOString();
        trace.finalObservation = observation;
        return trace;
      }
      if (decision.kind === "stuck") {
        throw new Error(`discovery stuck at step ${step}: ${decision.reason}`);
      }

      const policyDecision = evaluatePolicy(policy, identity, decision.action);
      if (policyDecision.decision !== "allow") {
        throw new Error(`discovery policy stopped action: ${policyDecision.reason}`);
      }

      const receipt = await this.surface.act(decision.action);
      trace.entries.push({
        step,
        observation,
        action: decision.action,
        receipt,
        ...(decision.note ? { note: decision.note } : {}),
      });
    }

    throw new Error(`discovery exceeded maxSteps=${maxSteps}`);
  }
}
