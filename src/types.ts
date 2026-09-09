export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type ScalarType = "string" | "number" | "boolean";

export interface ValueSchema {
  type: ScalarType;
  description?: string;
  enum?: JsonPrimitive[];
  sensitive?: boolean;
  required?: boolean;
}

export interface SurfaceTarget {
  adapter: string;
  entrypoint?: string;
  compatibility?: JsonObject;
}

export type Locator =
  | { kind: "role"; role: string; name: string; exact?: boolean }
  | { kind: "label"; label: string; exact?: boolean }
  | { kind: "text"; text: string; context?: string; exact?: boolean }
  | { kind: "selector"; selector: string; rationale?: string }
  | { kind: "point"; x: number; y: number; coordinateSpace: "surface" }
  | { kind: "semantic"; name: string; args?: JsonObject };

export type ActionKind =
  | "navigate"
  | "click"
  | "type"
  | "select"
  | "read"
  | "wait"
  | "semantic";

export type Action =
  | {
      kind: "navigate";
      url: string;
      risk?: RiskClass;
      description?: string;
    }
  | {
      kind: "click";
      target: Locator;
      risk?: RiskClass;
      description?: string;
    }
  | {
      kind: "type";
      target: Locator;
      text: string;
      clear?: boolean;
      risk?: RiskClass;
      description?: string;
    }
  | {
      kind: "select";
      target: Locator;
      value: string;
      risk?: RiskClass;
      description?: string;
    }
  | {
      kind: "read";
      target: Locator;
      as?: ScalarType;
      description?: string;
    }
  | {
      kind: "wait";
      condition: Condition;
      timeoutMs: number;
      description?: string;
    }
  | {
      kind: "semantic";
      name: string;
      args?: JsonObject;
      risk?: RiskClass;
      description?: string;
    };

export type Condition =
  | { kind: "exists"; target: Locator }
  | { kind: "text_present"; text: string }
  | { kind: "text_equals"; target: Locator; value: string }
  | { kind: "url_matches"; pattern: string }
  | { kind: "state_equals"; path: string; value: JsonValue }
  | { kind: "semantic"; name: string; args?: JsonObject };

export interface ExtractionRule {
  output: string;
  target?: Locator;
  fromStatePath?: string;
  as: ScalarType;
}

export interface KnownOutcomeRule {
  code: string;
  when: Condition;
  detail?: string;
}

export interface RecoveryRule {
  when: Condition;
  actions: Action[];
  maxAttempts?: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs?: number;
}

export interface CapabilityStep {
  id: string;
  action: Action;
  before?: Condition[];
  after?: Condition[];
  knownOutcomes?: KnownOutcomeRule[];
  recoveries?: RecoveryRule[];
  retry?: RetryPolicy;
  onFailure?: "fail" | "human";
}

export interface CapabilityPolicy {
  allowedAdapters: string[];
  allowedActions: ActionKind[];
  allowedEntrypoints?: string[];
  consequentialActions?: string[];
  consequentialPolicy: "block" | "require_human" | "allow";
}

export interface Capability {
  format: "byheart-capability/v1";
  id: string;
  name: string;
  version: number;
  description?: string;
  target: SurfaceTarget;
  inputs: Record<string, ValueSchema>;
  outputs: Record<string, ValueSchema>;
  steps: CapabilityStep[];
  success: Condition[];
  extraction?: ExtractionRule[];
  policy: CapabilityPolicy;
  provenance?: {
    discoveredRunId?: string;
    createdAt?: string;
    model?: string;
    evidence?: string[];
  };
}

export type RiskClass = "safe" | "consequential";

export interface SurfaceIdentity {
  adapter: string;
  sessionId: string;
  entrypoint?: string;
  process?: {
    pid?: number;
    startedAt?: string;
  };
  metadata?: JsonObject;
}

export interface Observation {
  at: string;
  summary: string;
  state?: JsonObject;
  screenshot?: EvidenceRef;
  raw?: JsonObject;
}

export interface ActionReceipt {
  requestedAt: string;
  completedAt: string;
  delivered: boolean;
  effectObserved: boolean;
  detail?: string;
  before?: Observation;
  after?: Observation;
  evidence?: EvidenceRef[];
}

export interface CheckReceipt {
  condition: Condition;
  passed: boolean;
  detail?: string;
  observed?: JsonValue;
  evidence?: EvidenceRef[];
}

export interface EvidenceRef {
  kind: "screenshot" | "trace" | "log" | "receipt" | "snapshot" | "other";
  uri: string;
  sha256?: string;
  description?: string;
}

export interface Surface {
  identity(): Promise<SurfaceIdentity>;
  observe(): Promise<Observation>;
  act(action: Action): Promise<ActionReceipt>;
  check(condition: Condition): Promise<CheckReceipt>;
  extract(rule: ExtractionRule): Promise<JsonValue>;
  captureEvidence?(label: string): Promise<EvidenceRef | undefined>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
}

export type OwnershipState =
  | "automation_owned"
  | "paused_for_review"
  | "human_owned"
  | "returning_to_automation"
  | "completed"
  | "failed";

export type ReplayFailureClass =
  | "invalid_input"
  | "policy_denied"
  | "precondition_failed"
  | "action_failed"
  | "checkpoint_failed"
  | "timeout"
  | "surface_changed"
  | "internal";

export interface RunBase {
  runId: string;
  capabilityId: string;
  capabilityVersion: number;
  startedAt: string;
  finishedAt: string;
  evidence: EvidenceRef[];
}

export interface SuccessResult extends RunBase {
  status: "success";
  outputs: Record<string, JsonValue>;
}

export interface KnownOutcomeResult extends RunBase {
  status: "known_outcome";
  code: string;
  stepId: string;
  detail?: string;
}

export interface FailureResult extends RunBase {
  status: "failure";
  class: ReplayFailureClass;
  stepId?: string;
  expected?: string;
  observed?: string;
  detail: string;
}

export interface InterventionResult extends RunBase {
  status: "intervention_required";
  reason: string;
  stepId?: string;
  ownership: OwnershipState;
  session: SurfaceIdentity;
}

export type ReplayResult =
  | SuccessResult
  | KnownOutcomeResult
  | FailureResult
  | InterventionResult;

export interface EvidenceEvent {
  at: string;
  runId: string;
  kind:
    | "run_started"
    | "step_started"
    | "action_receipt"
    | "check"
    | "recovery"
    | "human_handoff"
    | "run_finished"
    | "discovery_decision";
  data: JsonObject;
}

export interface EvidenceSink {
  record(event: EvidenceEvent): Promise<void>;
  refs(): EvidenceRef[];
}

export interface TraceEntry {
  step: number;
  observation: Observation;
  action: Action;
  receipt: ActionReceipt;
  note?: string;
}

export interface DiscoveryTrace {
  runId: string;
  goal: string;
  target: SurfaceTarget;
  startedAt: string;
  finishedAt?: string;
  entries: TraceEntry[];
  finalObservation?: Observation;
}

export type ModelDecision =
  | { kind: "act"; action: Action; note?: string }
  | { kind: "done"; note?: string }
  | { kind: "stuck"; reason: string };

export interface DecisionModel {
  id: string;
  decide(input: {
    goal: string;
    target: SurfaceTarget;
    observation: Observation;
    trace: TraceEntry[];
    allowedActions: ActionKind[];
  }): Promise<ModelDecision>;
}
