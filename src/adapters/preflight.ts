import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
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

export const PREFLIGHT_RUNTIME_ACTIONS = [
  "main-menu.continue",
  "campaign.pause",
  "campaign.unpause",
  "campaign.begin-frame-window",
  "campaign.prepare-combat-fixture",
  "campaign.verify-combat-fixture",
  "simulation.opponents.all",
  "simulation.opponents.deploy",
  "simulation.allies.select",
  "simulation.allies.all",
  "simulation.allies.deploy",
  "simulation.engage",
  "combat.pause",
  "combat.unpause",
  "combat.capture-viewport",
  "combat.zoom-out",
  "combat.set-stress-viewport",
  "combat.verify-zoom-out",
  "combat.begin-frame-window",
  "combat.end-frame-window",
  "combat.prepare-symmetric-1000dp-fixture",
] as const;

export type PreflightRuntimeAction = (typeof PREFLIGHT_RUNTIME_ACTIONS)[number];
export type PreflightRuntimeStateName =
  | "starting"
  | "main-menu-ready"
  | "main-menu-interactive"
  | "campaign-ready"
  | "simulation-ready"
  | "combat-ready"
  | "stopped";

export interface PreflightRuntimeState {
  format: "starsector-preflight-runtime-state-v1" | "starsector-preflight-runtime-state-v2";
  pid: number;
  processStartedAt: string;
  state: PreflightRuntimeStateName;
  sequence: number;
  observedAt: string;
  [key: string]: JsonValue;
}

export interface PreflightActionResult {
  action: PreflightRuntimeAction;
  sequence: number;
  executed: boolean;
  verified: boolean;
  detail: string;
  before: PreflightRuntimeState;
  after: PreflightRuntimeState;
  receipt: JsonObject;
}

export interface PreflightRuntimeTransport {
  state(): Promise<PreflightRuntimeState>;
  act(action: PreflightRuntimeAction): Promise<PreflightActionResult>;
}

export interface FilePreflightRuntimeTransportOptions {
  runDirectory: string;
  timeoutMs?: number;
  pollMs?: number;
  requestFormat?: string;
  receiptFormat?: string;
}

export class FilePreflightRuntimeTransport implements PreflightRuntimeTransport {
  private readonly runDirectory: string;
  private readonly timeoutMs: number;
  private readonly pollMs: number;
  private readonly requestFormat: string;
  private readonly receiptFormat: string;

  constructor(options: FilePreflightRuntimeTransportOptions) {
    this.runDirectory = resolve(options.runDirectory);
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.pollMs = options.pollMs ?? 20;
    this.requestFormat = options.requestFormat ?? "starsector-preflight-runtime-action-request-v6";
    this.receiptFormat = options.receiptFormat ?? "starsector-preflight-runtime-action-receipt-v6";
  }

  async state(): Promise<PreflightRuntimeState> {
    const path = resolve(this.runDirectory, "runtime-state.json");
    const fileStat = await stat(path);
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > 64 * 1024) {
      throw new Error(`invalid Preflight runtime state file: ${path}`);
    }
    const value = JSON.parse(await readFile(path, "utf8")) as PreflightRuntimeState;
    validateRuntimeState(value);
    return value;
  }

  async act(action: PreflightRuntimeAction): Promise<PreflightActionResult> {
    if (!PREFLIGHT_RUNTIME_ACTIONS.includes(action)) {
      throw new Error(`unsupported Preflight runtime action: ${action}`);
    }
    const before = await this.state();
    const expectedState = expectedStateFor(action);
    if (before.state !== expectedState) {
      throw new Error(`${action} requires ${expectedState}; observed ${before.state}`);
    }

    const sequence = await this.nextSequence();
    const request = resolve(this.runDirectory, "runtime-action-request.json");
    const receipt = resolve(this.runDirectory, "runtime-action-receipt.json");
    await requireAbsent(request, "runtime action request");
    await requireAbsent(receipt, "runtime action receipt");

    const deadline = new Date(Date.now() + this.timeoutMs).toISOString();
    const requestValue: JsonObject = {
      format: this.requestFormat,
      sequence,
      pid: before.pid,
      processStartedAt: before.processStartedAt,
      action,
      expectedState,
      deadline,
    };
    await createOnceJson(request, requestValue);

    const receiptValue = await this.waitForReceipt(
      receipt,
      sequence,
      action,
      before.pid,
      before.processStartedAt,
      expectedState,
    );
    const after = await this.waitForVerifiedState(action, before);
    const executed = receiptValue.status === "executed";
    const verified = executed && effectVerified(action, before, after, receiptValue);
    const detail = typeof receiptValue.detail === "string"
      ? receiptValue.detail
      : executed ? "runtime action executed" : `runtime status ${String(receiptValue.status)}`;

    await this.archive(request, "runtime-action-request", sequence);
    await this.archive(receipt, "runtime-action-receipt", sequence);

    return {
      action,
      sequence,
      executed,
      verified,
      detail,
      before,
      after,
      receipt: receiptValue,
    };
  }

  private async waitForReceipt(
    path: string,
    sequence: number,
    action: PreflightRuntimeAction,
    pid: number,
    processStartedAt: string,
    expectedState: string,
  ): Promise<JsonObject> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() <= deadline) {
      if (await exists(path)) {
        const fileStat = await stat(path);
        if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > 16 * 1024) {
          throw new Error(`invalid Preflight runtime receipt size: ${fileStat.size}`);
        }
        const value = JSON.parse(await readFile(path, "utf8")) as JsonObject;
        if (value.format !== this.receiptFormat) {
          throw new Error(`unexpected Preflight receipt format: ${String(value.format)}`);
        }
        requireEqual(value.sequence, sequence, "receipt sequence");
        requireEqual(value.pid, pid, "receipt pid");
        requireEqual(value.processStartedAt, processStartedAt, "receipt processStartedAt");
        requireEqual(value.action, action, "receipt action");
        requireEqual(value.beforeState, expectedState, "receipt beforeState");
        return value;
      }
      await sleep(this.pollMs);
    }
    throw new Error(`timed out waiting for Preflight runtime receipt for ${action}`);
  }

  private async waitForVerifiedState(
    action: PreflightRuntimeAction,
    before: PreflightRuntimeState,
  ): Promise<PreflightRuntimeState> {
    const deadline = Date.now() + this.timeoutMs;
    const desired = action === "main-menu.continue"
      ? "campaign-ready"
      : action === "simulation.engage"
        ? "combat-ready"
        : expectedStateFor(action);
    let last = before;
    while (Date.now() <= deadline) {
      last = await this.state();
      if (last.pid !== before.pid || last.processStartedAt !== before.processStartedAt) {
        throw new Error("Preflight runtime state changed process lifetime during action");
      }
      if (last.state === desired) return last;
      if (last.state === "stopped") throw new Error(`Starsector stopped during ${action}`);
      await sleep(this.pollMs);
    }
    throw new Error(`${action} did not reach ${desired}; last state was ${last.state}`);
  }

  private async nextSequence(): Promise<number> {
    await mkdir(this.runDirectory, { recursive: true });
    const names = await readdir(this.runDirectory);
    let max = 0;
    for (const name of names) {
      const match = name.match(/^runtime-action-(?:request|receipt)-(\d{6,})\.json$/);
      if (match?.[1]) max = Math.max(max, Number(match[1]));
    }
    return max + 1;
  }

  private async archive(active: string, stem: string, sequence: number): Promise<void> {
    const destination = resolve(
      this.runDirectory,
      `${stem}-${String(sequence).padStart(6, "0")}.json`,
    );
    await requireAbsent(destination, `${stem} history`);
    await rename(active, destination);
  }
}

export interface PreflightGameSurfaceOptions {
  transport: PreflightRuntimeTransport;
  entrypoint?: string;
  evidence?: () => Promise<EvidenceRef | undefined>;
}

export class PreflightGameSurface implements Surface {
  private readonly entrypoint: string;

  constructor(private readonly options: PreflightGameSurfaceOptions) {
    this.entrypoint = options.entrypoint ?? "preflight://starsector/runtime";
  }

  async identity(): Promise<SurfaceIdentity> {
    const state = await this.options.transport.state();
    return {
      adapter: "preflight-starsector",
      sessionId: `${state.pid}@${state.processStartedAt}`,
      entrypoint: this.entrypoint,
      process: {
        pid: state.pid,
        startedAt: state.processStartedAt,
      },
      metadata: {
        state: state.state,
        sequence: state.sequence,
        runtimeFormat: state.format,
      },
    };
  }

  async observe(): Promise<Observation> {
    const state = await this.options.transport.state();
    const screenshot = await this.options.evidence?.();
    return {
      at: state.observedAt,
      summary: [
        `STARSECTOR ${state.state}`,
        `PID ${state.pid} started ${state.processStartedAt}`,
        `runtime sequence ${state.sequence}`,
      ].join("\n"),
      state: state as JsonObject,
      raw: { runtime: state as JsonObject },
      ...(screenshot ? { screenshot } : {}),
    };
  }

  async act(action: Action): Promise<ActionReceipt> {
    const requestedAt = new Date().toISOString();
    const before = await this.observe();
    if (action.kind !== "semantic" || !isPreflightAction(action.name)) {
      return {
        requestedAt,
        completedAt: new Date().toISOString(),
        delivered: false,
        effectObserved: false,
        detail: `Preflight game surface accepts only its closed semantic action catalog; got ${action.kind}`,
        before,
        after: before,
      };
    }

    try {
      const result = await this.options.transport.act(action.name);
      const after = await this.observe();
      return {
        requestedAt,
        completedAt: new Date().toISOString(),
        delivered: result.executed,
        effectObserved: result.verified,
        detail: result.detail,
        before,
        after,
        evidence: [before.screenshot, after.screenshot].filter((item): item is EvidenceRef => item !== undefined),
      };
    } catch (error) {
      const after = await this.observe().catch(() => before);
      return {
        requestedAt,
        completedAt: new Date().toISOString(),
        delivered: false,
        effectObserved: false,
        detail: error instanceof Error ? error.message : String(error),
        before,
        after,
      };
    }
  }

  async check(condition: Condition): Promise<CheckReceipt> {
    const observation = await this.observe();
    switch (condition.kind) {
      case "state_equals": {
        const observed = resolvePath(observation.raw ?? {}, condition.path);
        const passed = observed !== undefined && JSON.stringify(observed) === JSON.stringify(condition.value);
        return checkReceipt(condition, passed, observed ?? null, `state path ${condition.path}`);
      }
      case "semantic": {
        if (condition.name !== "preflight.state") {
          return checkReceipt(condition, false, null, `unknown Preflight semantic check ${condition.name}`);
        }
        const expected = condition.args?.state;
        const observed = resolvePath(observation.raw ?? {}, "runtime.state");
        const passed = typeof expected === "string" && observed === expected;
        return checkReceipt(condition, passed, observed ?? null, `runtime state ${String(observed)}`);
      }
      case "exists":
      case "text_present":
      case "text_equals":
      case "url_matches":
        return checkReceipt(condition, false, null, `${condition.kind} requires a visual or UI adapter`);
    }
  }

  async extract(rule: ExtractionRule): Promise<JsonValue> {
    if (!rule.fromStatePath) throw new Error("Preflight extraction requires fromStatePath");
    const observation = await this.observe();
    const value = resolvePath(observation.raw ?? {}, rule.fromStatePath);
    if (value === undefined) throw new Error(`state path missing: ${rule.fromStatePath}`);
    if (value === null || typeof value === "object") throw new Error(`cannot extract complex value as ${rule.as}`);
    if (rule.as === "string") return String(value);
    if (rule.as === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error(`cannot coerce ${String(value)} to number`);
      return number;
    }
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`cannot coerce ${String(value)} to boolean`);
  }

  async captureEvidence(): Promise<EvidenceRef | undefined> {
    return this.options.evidence?.();
  }

  async pause(): Promise<void> {
    // This pauses Byheart ownership only. Campaign pause is an explicit semantic game action.
  }

  async resume(): Promise<void> {
    await this.identity();
  }
}

function expectedStateFor(action: PreflightRuntimeAction): PreflightRuntimeStateName {
  if (action === "main-menu.continue") return "main-menu-interactive";
  if (action.startsWith("combat.")) return "combat-ready";
  if (action.startsWith("simulation.")) return "simulation-ready";
  return "campaign-ready";
}

function effectVerified(
  action: PreflightRuntimeAction,
  before: PreflightRuntimeState,
  after: PreflightRuntimeState,
  receipt: JsonObject,
): boolean {
  if (action === "main-menu.continue") return after.state === "campaign-ready";
  if (action === "simulation.engage") return after.state === "combat-ready";
  if (action === "campaign.pause" || action === "combat.pause") return receipt.afterPaused === true;
  if (action === "campaign.unpause" || action === "combat.unpause") return receipt.afterPaused === false;
  return before.pid === after.pid && before.processStartedAt === after.processStartedAt;
}

function isPreflightAction(value: string): value is PreflightRuntimeAction {
  return PREFLIGHT_RUNTIME_ACTIONS.includes(value as PreflightRuntimeAction);
}

function validateRuntimeState(value: PreflightRuntimeState): void {
  if (!["starsector-preflight-runtime-state-v1", "starsector-preflight-runtime-state-v2"].includes(value.format)) {
    throw new Error(`unsupported Preflight runtime state format: ${value.format}`);
  }
  if (!Number.isInteger(value.pid) || value.pid <= 0) throw new Error("Preflight runtime pid is invalid");
  if (!value.processStartedAt || !value.observedAt) throw new Error("Preflight runtime timestamps are missing");
  const states: PreflightRuntimeStateName[] = [
    "starting",
    "main-menu-ready",
    "main-menu-interactive",
    "campaign-ready",
    "simulation-ready",
    "combat-ready",
    "stopped",
  ];
  if (!states.includes(value.state)) throw new Error(`unsupported Preflight runtime state: ${value.state}`);
  if (!Number.isInteger(value.sequence) || value.sequence < 0) throw new Error("Preflight runtime sequence is invalid");
}

async function createOnceJson(path: string, value: JsonObject): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, JSON.stringify(value) + "\n", { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

async function requireAbsent(path: string, label: string): Promise<void> {
  if (await exists(path)) throw new Error(`${label} already exists: ${path}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function requireEqual(actual: JsonValue | undefined, expected: JsonValue, label: string): void {
  if (actual !== expected) throw new Error(`${label} differs: expected ${String(expected)}; observed ${String(actual)}`);
}

function checkReceipt(condition: Condition, passed: boolean, observed: JsonValue, detail: string): CheckReceipt {
  return { condition, passed, observed, detail };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
