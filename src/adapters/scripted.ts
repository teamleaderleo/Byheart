import type {
  Action,
  ActionReceipt,
  CheckReceipt,
  Condition,
  EvidenceRef,
  ExtractionRule,
  JsonObject,
  JsonValue,
  Observation,
  Surface,
  SurfaceIdentity,
} from "../types.js";
import { resolvePath } from "../template.js";

export interface ScriptedSurfaceOptions {
  adapter?: string;
  sessionId?: string;
  entrypoint?: string;
  initialState?: JsonObject;
  actions: Record<
    string,
    (state: JsonObject, args: JsonObject | undefined) => void | { effectObserved?: boolean; detail?: string }
  >;
  semanticChecks?: Record<string, (state: JsonObject, args: JsonObject | undefined) => boolean>;
}

export class ScriptedSurface implements Surface {
  readonly state: JsonObject;
  private paused = false;

  constructor(private readonly options: ScriptedSurfaceOptions) {
    this.state = structuredClone(options.initialState ?? {});
  }

  async identity(): Promise<SurfaceIdentity> {
    return {
      adapter: this.options.adapter ?? "scripted",
      sessionId: this.options.sessionId ?? "scripted-session",
      ...(this.options.entrypoint ? { entrypoint: this.options.entrypoint } : {}),
      metadata: { paused: this.paused },
    };
  }

  async observe(): Promise<Observation> {
    return {
      at: new Date().toISOString(),
      summary: JSON.stringify(this.state),
      state: structuredClone(this.state),
    };
  }

  async act(action: Action): Promise<ActionReceipt> {
    const before = await this.observe();
    const started = new Date().toISOString();
    let delivered = false;
    let effectObserved = false;
    let detail = "";

    if (action.kind === "semantic") {
      const handler = this.options.actions[action.name];
      if (!handler) {
        detail = `unsupported semantic action: ${action.name}`;
      } else {
        delivered = true;
        const previous = JSON.stringify(this.state);
        const result = handler(this.state, action.args);
        effectObserved = result?.effectObserved ?? previous !== JSON.stringify(this.state);
        detail = result?.detail ?? action.name;
      }
    } else if (action.kind === "wait") {
      const check = await this.check(action.condition);
      delivered = true;
      effectObserved = check.passed;
      detail = check.detail ?? "wait checked once in scripted adapter";
    } else {
      detail = `scripted adapter only implements semantic/wait actions; got ${action.kind}`;
    }

    return {
      requestedAt: started,
      completedAt: new Date().toISOString(),
      delivered,
      effectObserved,
      detail,
      before,
      after: await this.observe(),
    };
  }

  async check(condition: Condition): Promise<CheckReceipt> {
    let passed = false;
    let observed: JsonValue | undefined;

    switch (condition.kind) {
      case "state_equals":
        observed = resolvePath(this.state, condition.path);
        passed = deepEqual(observed, condition.value);
        break;
      case "text_present":
        passed = JSON.stringify(this.state).includes(condition.text);
        break;
      case "semantic": {
        const handler = this.options.semanticChecks?.[condition.name];
        passed = handler ? handler(this.state, condition.args) : false;
        break;
      }
      case "exists":
      case "text_equals":
      case "url_matches":
        passed = false;
        break;
    }

    return {
      condition,
      passed,
      ...(observed === undefined ? {} : { observed }),
      detail: passed ? "condition passed" : "condition failed",
    };
  }

  async extract(rule: ExtractionRule): Promise<JsonValue> {
    if (rule.fromStatePath) {
      const value = resolvePath(this.state, rule.fromStatePath);
      if (value === undefined) throw new Error(`state path missing: ${rule.fromStatePath}`);
      return coerce(value, rule.as);
    }
    throw new Error("scripted adapter extraction requires fromStatePath");
  }

  async captureEvidence(label: string): Promise<EvidenceRef> {
    return {
      kind: "snapshot",
      uri: `memory://scripted/${encodeURIComponent(label)}`,
      description: JSON.stringify(this.state),
    };
  }

  async pause(): Promise<void> {
    this.paused = true;
  }

  async resume(): Promise<void> {
    this.paused = false;
  }
}

function deepEqual(a: JsonValue | undefined, b: JsonValue): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

function coerce(value: JsonValue, type: ExtractionRule["as"]): JsonValue {
  if (value === null || typeof value === "object") {
    throw new Error(`cannot coerce complex value to ${type}`);
  }
  if (type === "string") return String(value);
  if (type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`cannot coerce ${String(value)} to number`);
    return number;
  }
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`cannot coerce ${String(value)} to boolean`);
}
