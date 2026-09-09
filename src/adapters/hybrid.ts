import { randomUUID } from "node:crypto";
import { resolvePath } from "../template.js";
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

export interface HybridSurfaceOptions {
  semantic: Surface;
  visual: Surface;
  adapter?: string;
  entrypoint?: string;
  visualSemanticPrefixes?: string[];
  routeAction?: (action: Action) => "semantic" | "visual";
}

/**
 * Combines a narrow semantic control plane with an independent visual surface.
 * This is useful for games and legacy software: trusted domain actions can run
 * through a reviewed adapter while screenshots/mouse/keyboard remain available
 * for everything the semantic adapter does not model.
 */
export class HybridSurface implements Surface {
  private readonly adapter: string;
  private readonly entrypoint: string;
  private readonly visualSemanticPrefixes: string[];
  private readonly syntheticId = randomUUID();

  constructor(private readonly options: HybridSurfaceOptions) {
    this.adapter = options.adapter ?? "hybrid";
    this.entrypoint = options.entrypoint ?? "byheart://hybrid";
    this.visualSemanticPrefixes = options.visualSemanticPrefixes ?? ["remote."];
  }

  async identity(): Promise<SurfaceIdentity> {
    const [semantic, visual] = await Promise.all([
      this.options.semantic.identity(),
      this.options.visual.identity(),
    ]);
    return {
      adapter: this.adapter,
      sessionId: `${this.syntheticId}:${semantic.sessionId}:${visual.sessionId}`,
      entrypoint: this.entrypoint,
      metadata: {
        semanticAdapter: semantic.adapter,
        semanticSession: semantic.sessionId,
        visualAdapter: visual.adapter,
        visualSession: visual.sessionId,
        semanticEntrypoint: semantic.entrypoint ?? null,
        visualEntrypoint: visual.entrypoint ?? null,
      },
    };
  }

  async observe(): Promise<Observation> {
    const [semantic, visual] = await Promise.all([
      this.options.semantic.observe(),
      this.options.visual.observe(),
    ]);
    const raw: JsonObject = {
      semantic: observationValue(semantic),
      visual: observationValue(visual),
    };
    return {
      at: later(semantic.at, visual.at),
      summary: `[SEMANTIC]\n${semantic.summary}\n\n[VISUAL]\n${visual.summary}`,
      raw,
      ...(visual.screenshot ? { screenshot: visual.screenshot } : semantic.screenshot ? { screenshot: semantic.screenshot } : {}),
    };
  }

  async act(action: Action): Promise<ActionReceipt> {
    if (action.kind === "wait") return this.wait(action);

    const requestedAt = new Date().toISOString();
    const before = await this.observe();
    const surface = this.route(action) === "visual" ? this.options.visual : this.options.semantic;
    const delegated = await surface.act(action);
    const after = await this.observe();
    return {
      requestedAt,
      completedAt: new Date().toISOString(),
      delivered: delegated.delivered,
      effectObserved: delegated.effectObserved || fingerprint(before) !== fingerprint(after),
      ...(delegated.detail ? { detail: delegated.detail } : {}),
      before,
      after,
      evidence: mergeEvidence(delegated.evidence, before.screenshot, after.screenshot),
    };
  }

  async check(condition: Condition): Promise<CheckReceipt> {
    if (condition.kind === "state_equals") {
      const observation = await this.observe();
      const observed = resolvePath(observation.raw ?? {}, condition.path);
      const passed = observed !== undefined && JSON.stringify(observed) === JSON.stringify(condition.value);
      return {
        condition,
        passed,
        ...(observed === undefined ? {} : { observed }),
        detail: `hybrid state path ${condition.path}`,
      };
    }

    if (condition.kind === "semantic") {
      const surface = this.visualSemanticPrefixes.some((prefix) => condition.name.startsWith(prefix))
        ? this.options.visual
        : this.options.semantic;
      return surface.check(condition);
    }

    return this.options.visual.check(condition);
  }

  async extract(rule: ExtractionRule): Promise<JsonValue> {
    if (rule.fromStatePath) {
      const observation = await this.observe();
      const value = resolvePath(observation.raw ?? {}, rule.fromStatePath);
      if (value === undefined) throw new Error(`hybrid state path missing: ${rule.fromStatePath}`);
      return coerce(value, rule.as);
    }
    return this.options.visual.extract(rule);
  }

  async captureEvidence(label: string): Promise<EvidenceRef | undefined> {
    return this.options.visual.captureEvidence?.(label)
      ?? this.options.semantic.captureEvidence?.(label);
  }

  async pause(): Promise<void> {
    await Promise.all([
      this.options.semantic.pause?.(),
      this.options.visual.pause?.(),
    ]);
  }

  async resume(): Promise<void> {
    await Promise.all([
      this.options.semantic.resume?.(),
      this.options.visual.resume?.(),
    ]);
    await this.identity();
  }

  private route(action: Action): "semantic" | "visual" {
    if (this.options.routeAction) return this.options.routeAction(action);
    if (action.kind === "semantic") {
      return this.visualSemanticPrefixes.some((prefix) => action.name.startsWith(prefix))
        ? "visual"
        : "semantic";
    }
    return "visual";
  }

  private async wait(action: Extract<Action, { kind: "wait" }>): Promise<ActionReceipt> {
    const requestedAt = new Date().toISOString();
    const before = await this.observe();
    const deadline = Date.now() + action.timeoutMs;
    let last: CheckReceipt | undefined;
    while (Date.now() <= deadline) {
      last = await this.check(action.condition);
      if (last.passed) {
        const after = await this.observe();
        return {
          requestedAt,
          completedAt: new Date().toISOString(),
          delivered: true,
          effectObserved: true,
          detail: last.detail ?? "hybrid wait condition passed",
          before,
          after,
          evidence: mergeEvidence(undefined, before.screenshot, after.screenshot),
        };
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    const after = await this.observe();
    return {
      requestedAt,
      completedAt: new Date().toISOString(),
      delivered: false,
      effectObserved: false,
      detail: `hybrid wait timed out after ${action.timeoutMs}ms${last?.detail ? `: ${last.detail}` : ""}`,
      before,
      after,
      evidence: mergeEvidence(undefined, before.screenshot, after.screenshot),
    };
  }
}

function observationValue(observation: Observation): JsonObject {
  return {
    at: observation.at,
    summary: observation.summary,
    state: observation.state ?? null,
    raw: observation.raw ?? null,
    screenshot: observation.screenshot ? {
      kind: observation.screenshot.kind,
      uri: observation.screenshot.uri,
      sha256: observation.screenshot.sha256 ?? null,
    } : null,
  };
}

function mergeEvidence(
  delegated: EvidenceRef[] | undefined,
  before: EvidenceRef | undefined,
  after: EvidenceRef | undefined,
): EvidenceRef[] {
  const values = [...(delegated ?? []), ...(before ? [before] : []), ...(after ? [after] : [])];
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.kind}:${value.uri}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function coerce(value: JsonValue, type: ExtractionRule["as"]): JsonValue {
  if (value === null || typeof value === "object") throw new Error(`cannot coerce complex value to ${type}`);
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

function fingerprint(observation: Observation): string {
  return JSON.stringify(observation.raw ?? observation.summary);
}

function later(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}
