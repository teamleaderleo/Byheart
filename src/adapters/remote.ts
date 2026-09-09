import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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

export interface RemoteSession {
  format: "byheart-remote-session/v1";
  sessionId: string;
  platform: string;
  width: number;
  height: number;
  scale?: number;
  metadata?: JsonObject;
}

export interface RemoteFrame {
  png: Uint8Array;
  width: number;
  height: number;
  capturedAt: string;
  sha256: string;
}

export type RemoteInput =
  | { kind: "move"; x: number; y: number }
  | { kind: "click"; x: number; y: number; button?: "left" | "right" | "middle"; count?: number }
  | { kind: "drag"; fromX: number; fromY: number; toX: number; toY: number; button?: "left" | "right" | "middle"; durationMs?: number }
  | { kind: "text"; text: string; replace?: boolean }
  | { kind: "key"; key: string }
  | { kind: "hotkey"; keys: string[] };

export interface RemoteTransport {
  session(): Promise<RemoteSession>;
  frame(): Promise<RemoteFrame>;
  input(action: RemoteInput): Promise<{ delivered: boolean; detail?: string }>;
}

export interface HttpRemoteTransportOptions {
  endpoint: string;
  token?: string;
  timeoutMs?: number;
}

export class HttpRemoteTransport implements RemoteTransport {
  private readonly endpoint: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: HttpRemoteTransportOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async session(): Promise<RemoteSession> {
    const response = await this.request("/v1/session");
    const value = await response.json() as RemoteSession;
    validateSession(value);
    return value;
  }

  async frame(): Promise<RemoteFrame> {
    const response = await this.request("/v1/frame");
    const png = new Uint8Array(await response.arrayBuffer());
    if (png.length === 0 || png.length > 50 * 1024 * 1024) {
      throw new Error(`remote frame has invalid size: ${png.length}`);
    }
    const width = positiveInteger(response.headers.get("x-byheart-width"), "frame width");
    const height = positiveInteger(response.headers.get("x-byheart-height"), "frame height");
    const capturedAt = response.headers.get("x-byheart-captured-at") ?? new Date().toISOString();
    const sha256 = createHash("sha256").update(png).digest("hex");
    return { png, width, height, capturedAt, sha256 };
  }

  async input(action: RemoteInput): Promise<{ delivered: boolean; detail?: string }> {
    const response = await this.request("/v1/input", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
    const body = await response.json() as { delivered?: unknown; detail?: unknown };
    return {
      delivered: body.delivered === true,
      ...(typeof body.detail === "string" ? { detail: body.detail } : {}),
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    const response = await fetch(`${this.endpoint}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`remote endpoint ${path} failed (${response.status}): ${detail.slice(0, 1000)}`);
    }
    return response;
  }
}

export interface RemoteDesktopSurfaceOptions {
  endpoint: string;
  transport: RemoteTransport;
  artifactDir?: string;
  sessionId?: string;
  waitIntervalMs?: number;
}

export class RemoteDesktopSurface implements Surface {
  private readonly artifactDir: string;
  private readonly requestedSessionId: string | undefined;
  private readonly waitIntervalMs: number;
  private evidenceSequence = 0;
  private cachedSession?: RemoteSession;

  constructor(private readonly options: RemoteDesktopSurfaceOptions) {
    this.artifactDir = resolve(options.artifactDir ?? `runtime/remote-${randomUUID()}`);
    this.requestedSessionId = options.sessionId;
    this.waitIntervalMs = options.waitIntervalMs ?? 125;
  }

  async identity(): Promise<SurfaceIdentity> {
    const session = await this.getSession();
    return {
      adapter: "remote-desktop",
      sessionId: session.sessionId,
      entrypoint: this.options.endpoint,
      metadata: {
        platform: session.platform,
        width: session.width,
        height: session.height,
        scale: session.scale ?? 1,
        ...(session.metadata ?? {}),
      },
    };
  }

  async observe(): Promise<Observation> {
    const session = await this.getSession();
    const captured = await this.captureFrame("observe");
    const raw: JsonObject = {
      session: {
        id: session.sessionId,
        platform: session.platform,
        width: session.width,
        height: session.height,
        scale: session.scale ?? 1,
      },
      frame: {
        sha256: captured.frame.sha256,
        width: captured.frame.width,
        height: captured.frame.height,
        capturedAt: captured.frame.capturedAt,
      },
    };
    return {
      at: captured.frame.capturedAt,
      summary: [
        `REMOTE DESKTOP ${session.platform} ${session.width}x${session.height}`,
        `FRAME SHA256 ${captured.frame.sha256}`,
        "The screenshot is the primary observation. Use point targets in surface coordinates when no stronger target is available.",
      ].join("\n"),
      raw,
      screenshot: captured.evidence,
    };
  }

  async act(action: Action): Promise<ActionReceipt> {
    const requestedAt = new Date().toISOString();
    const before = await this.observe();
    let delivered = false;
    let detail = "";

    try {
      const input = remoteInputFromAction(action);
      if (!input) {
        if (action.kind === "wait") {
          await this.waitForCondition(action.condition, action.timeoutMs);
          delivered = true;
          detail = "wait condition passed";
        } else {
          detail = `remote desktop does not implement ${action.kind} without a point/remote semantic action`;
        }
      } else {
        const result = await this.options.transport.input(input);
        delivered = result.delivered;
        detail = result.detail ?? input.kind;
      }
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }

    const after = await this.observe();
    const beforeHash = resolvePath(before.raw ?? {}, "frame.sha256");
    const afterHash = resolvePath(after.raw ?? {}, "frame.sha256");
    const effectObserved = delivered && (
      action.kind === "wait" ||
      (typeof beforeHash === "string" && typeof afterHash === "string" && beforeHash !== afterHash)
    );

    return {
      requestedAt,
      completedAt: new Date().toISOString(),
      delivered,
      effectObserved,
      detail,
      before,
      after,
      evidence: [before.screenshot, after.screenshot].filter((item): item is EvidenceRef => item !== undefined),
    };
  }

  async check(condition: Condition): Promise<CheckReceipt> {
    try {
      switch (condition.kind) {
        case "exists": {
          if (condition.target.kind !== "point") {
            return checkReceipt(condition, false, null, "remote desktop only validates point existence directly");
          }
          const session = await this.getSession();
          const passed = inBounds(condition.target.x, condition.target.y, session.width, session.height);
          return checkReceipt(condition, passed, passed, `${condition.target.x},${condition.target.y} within ${session.width}x${session.height}`);
        }
        case "state_equals": {
          const observation = await this.observe();
          const observed = resolvePath(observation.raw ?? {}, condition.path);
          const passed = observed !== undefined && JSON.stringify(observed) === JSON.stringify(condition.value);
          return checkReceipt(condition, passed, observed ?? null, `state path ${condition.path}`);
        }
        case "semantic":
          return this.semanticCheck(condition);
        case "text_present":
        case "text_equals":
        case "url_matches":
          return checkReceipt(condition, false, null, `${condition.kind} needs a richer remote observation adapter`);
      }
    } catch (error) {
      return checkReceipt(condition, false, null, error instanceof Error ? error.message : String(error));
    }
  }

  async extract(rule: ExtractionRule): Promise<JsonValue> {
    if (!rule.fromStatePath) throw new Error("remote desktop extraction currently requires fromStatePath");
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

  async captureEvidence(label: string): Promise<EvidenceRef> {
    return (await this.captureFrame(label)).evidence;
  }

  async pause(): Promise<void> {
    // The guest session stays alive; input ownership moves to the human/operator.
  }

  async resume(): Promise<void> {
    const identity = await this.identity();
    if (this.requestedSessionId && identity.sessionId !== this.requestedSessionId) {
      throw new Error(`remote session changed during handoff: ${this.requestedSessionId} -> ${identity.sessionId}`);
    }
  }

  private async getSession(): Promise<RemoteSession> {
    const session = await this.options.transport.session();
    if (this.cachedSession && this.cachedSession.sessionId !== session.sessionId) {
      throw new Error(`remote session changed: ${this.cachedSession.sessionId} -> ${session.sessionId}`);
    }
    if (this.requestedSessionId && this.requestedSessionId !== session.sessionId) {
      throw new Error(`remote session identity differs: expected ${this.requestedSessionId}; observed ${session.sessionId}`);
    }
    this.cachedSession = session;
    return session;
  }

  private async captureFrame(label: string): Promise<{ frame: RemoteFrame; evidence: EvidenceRef }> {
    await mkdir(this.artifactDir, { recursive: true });
    const frame = await this.options.transport.frame();
    const session = await this.getSession();
    if (frame.width !== session.width || frame.height !== session.height) {
      throw new Error(`remote frame dimensions ${frame.width}x${frame.height} differ from session ${session.width}x${session.height}`);
    }
    this.evidenceSequence += 1;
    const filename = `${String(this.evidenceSequence).padStart(4, "0")}-${slug(label)}.png`;
    const path = resolve(this.artifactDir, filename);
    await writeFile(path, frame.png);
    return {
      frame,
      evidence: {
        kind: "screenshot",
        uri: `file://${path}`,
        sha256: frame.sha256,
        description: `${label}; remote session ${session.sessionId}; ${frame.width}x${frame.height}`,
      },
    };
  }

  private async semanticCheck(condition: Extract<Condition, { kind: "semantic" }>): Promise<CheckReceipt> {
    const frame = await this.options.transport.frame();
    const expected = condition.args?.sha256;
    if (condition.name === "remote.frame_hash_equals") {
      const passed = typeof expected === "string" && frame.sha256 === expected;
      return checkReceipt(condition, passed, frame.sha256, `observed frame ${frame.sha256}`);
    }
    if (condition.name === "remote.frame_hash_differs") {
      const passed = typeof expected === "string" && frame.sha256 !== expected;
      return checkReceipt(condition, passed, frame.sha256, `observed frame ${frame.sha256}`);
    }
    return checkReceipt(condition, false, null, `unknown remote semantic check ${condition.name}`);
  }

  private async waitForCondition(condition: Condition, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last = "condition failed";
    while (Date.now() <= deadline) {
      const check = await this.check(condition);
      if (check.passed) return;
      last = check.detail ?? last;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, this.waitIntervalMs));
    }
    throw new Error(`remote condition timed out after ${timeoutMs}ms: ${last}`);
  }
}

function remoteInputFromAction(action: Action): RemoteInput | undefined {
  switch (action.kind) {
    case "click":
      if (action.target.kind !== "point") return undefined;
      return { kind: "click", x: action.target.x, y: action.target.y };
    case "type":
      if (action.target.kind !== "point") return undefined;
      return { kind: "text", text: action.text, replace: action.clear !== false };
    case "semantic": {
      const args = action.args ?? {};
      switch (action.name) {
        case "remote.move":
          return { kind: "move", x: finite(args.x, "x"), y: finite(args.y, "y") };
        case "remote.key":
          return { kind: "key", key: string(args.key, "key") };
        case "remote.hotkey": {
          const keys = args.keys;
          if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string")) {
            throw new Error("remote.hotkey args.keys must be a string array");
          }
          return { kind: "hotkey", keys };
        }
        case "remote.drag":
          return {
            kind: "drag",
            fromX: finite(args.fromX, "fromX"),
            fromY: finite(args.fromY, "fromY"),
            toX: finite(args.toX, "toX"),
            toY: finite(args.toY, "toY"),
            ...(typeof args.durationMs === "number" ? { durationMs: args.durationMs } : {}),
          };
        default:
          return undefined;
      }
    }
    default:
      return undefined;
  }
}

function validateSession(value: RemoteSession): void {
  if (value.format !== "byheart-remote-session/v1") throw new Error(`unsupported remote session format: ${value.format}`);
  if (!value.sessionId || !value.platform) throw new Error("remote session is missing identity");
  if (!Number.isInteger(value.width) || value.width <= 0 || !Number.isInteger(value.height) || value.height <= 0) {
    throw new Error(`remote session has invalid dimensions ${value.width}x${value.height}`);
  }
}

function positiveInteger(value: string | null, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} is invalid: ${String(value)}`);
  return number;
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < width && y < height;
}

function finite(value: JsonValue | undefined, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

function string(value: JsonValue | undefined, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function checkReceipt(condition: Condition, passed: boolean, observed: JsonValue, detail: string): CheckReceipt {
  return { condition, passed, observed, detail };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "evidence";
}
