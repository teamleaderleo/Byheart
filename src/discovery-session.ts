import { randomUUID } from "node:crypto";
import { toJsonObject } from "./json.js";
import { evaluatePolicy } from "./policy.js";
import type {
  Action,
  ActionKind,
  CapabilityPolicy,
  DiscoveryTrace,
  EvidenceSink,
  Observation,
  Surface,
  SurfaceTarget,
  TraceEntry,
} from "./types.js";

export interface DiscoverySessionOptions {
  maxSteps?: number;
  allowedActions: ActionKind[];
  consequentialPolicy?: "block" | "require_human" | "allow";
  allowedEntrypoints?: string[];
  runId?: string;
  driverId?: string;
  now?: () => Date;
}

export interface DiscoveryActionResult {
  entry: TraceEntry;
  observation: Observation;
}

/**
 * A resident discovery session that can be driven by any external reasoning
 * system: Codex, ChatGPT computer use, a local model, a human, or the optional
 * direct API adapter. The session owns policy, action receipts, trace identity,
 * and evidence while the reasoning system owns the next-action decision.
 */
export class DiscoverySession {
  private readonly now: () => Date;
  private readonly maxSteps: number;
  private readonly driverId: string;
  private readonly policy: CapabilityPolicy;
  private readonly traceValue: DiscoveryTrace;
  private pendingObservation?: Observation;
  private finished = false;

  constructor(
    private readonly surface: Surface,
    private readonly evidence: EvidenceSink,
    readonly goal: string,
    readonly target: SurfaceTarget,
    options: DiscoverySessionOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxSteps = options.maxSteps ?? 30;
    this.driverId = options.driverId ?? "external-agent";
    this.traceValue = {
      runId: options.runId ?? randomUUID(),
      goal,
      target,
      startedAt: this.now().toISOString(),
      entries: [],
    };
    this.policy = {
      allowedAdapters: [target.adapter],
      allowedActions: options.allowedActions,
      ...(options.allowedEntrypoints?.length
        ? { allowedEntrypoints: options.allowedEntrypoints }
        : target.entrypoint
          ? { allowedEntrypoints: [target.entrypoint] }
          : {}),
      consequentialPolicy: options.consequentialPolicy ?? "require_human",
    };
  }

  runId(): string {
    return this.traceValue.runId;
  }

  step(): number {
    return this.traceValue.entries.length + 1;
  }

  stepLimit(): number {
    return this.maxSteps;
  }

  allowedActions(): ActionKind[] {
    return [...this.policy.allowedActions];
  }

  trace(): DiscoveryTrace {
    return structuredClone(this.traceValue);
  }

  async observe(): Promise<Observation> {
    this.requireOpen();
    if (!this.pendingObservation) this.pendingObservation = await this.surface.observe();
    return this.pendingObservation;
  }

  async act(action: Action, note?: string, driverId = this.driverId): Promise<DiscoveryActionResult> {
    this.requireOpen();
    if (this.traceValue.entries.length >= this.maxSteps) {
      throw new Error(`discovery exceeded maxSteps=${this.maxSteps}`);
    }

    const observation = await this.observe();
    const identity = await this.surface.identity();
    const policyDecision = evaluatePolicy(this.policy, identity, action);
    if (policyDecision.decision !== "allow") {
      throw new Error(`discovery policy stopped action: ${policyDecision.reason}`);
    }

    const step = this.step();
    await this.evidence.record({
      at: this.now().toISOString(),
      runId: this.traceValue.runId,
      kind: "discovery_decision",
      data: {
        step,
        decision: toJsonObject({ kind: "act", action, ...(note ? { note } : {}) }),
        driver: driverId,
      },
    });

    const receipt = await this.surface.act(action);
    const entry: TraceEntry = {
      step,
      observation,
      action,
      receipt,
      ...(note ? { note } : {}),
    };
    this.traceValue.entries.push(entry);
    this.pendingObservation = undefined;
    const nextObservation = await this.observe();
    return { entry, observation: nextObservation };
  }

  async done(note?: string, driverId = this.driverId): Promise<DiscoveryTrace> {
    this.requireOpen();
    const observation = await this.observe();
    await this.evidence.record({
      at: this.now().toISOString(),
      runId: this.traceValue.runId,
      kind: "discovery_decision",
      data: {
        step: this.step(),
        decision: toJsonObject({ kind: "done", ...(note ? { note } : {}) }),
        driver: driverId,
      },
    });
    this.traceValue.finishedAt = this.now().toISOString();
    this.traceValue.finalObservation = observation;
    this.finished = true;
    return this.trace();
  }

  async stuck(reason: string, driverId = this.driverId): Promise<void> {
    this.requireOpen();
    await this.evidence.record({
      at: this.now().toISOString(),
      runId: this.traceValue.runId,
      kind: "discovery_decision",
      data: {
        step: this.step(),
        decision: toJsonObject({ kind: "stuck", reason }),
        driver: driverId,
      },
    });
    throw new Error(`discovery stuck at step ${this.step()}: ${reason}`);
  }

  private requireOpen(): void {
    if (this.finished) throw new Error("discovery session is already finished");
  }
}
