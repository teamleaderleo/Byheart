import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DiscoverySession } from "./discovery-session.js";
import { toJsonValue } from "./json.js";
import type {
  Action,
  Condition,
  DiscoveryTrace,
  JsonObject,
  Locator,
  Observation,
} from "./types.js";

export interface DiscoveryBridgeOptions {
  session: DiscoverySession;
  success: Condition[];
  driverId?: string;
  host?: string;
  port?: number;
}

/**
 * Local HTTP bridge for external reasoning agents. It keeps one live surface
 * resident while Codex (or any other agent) performs the observe -> decide ->
 * act loop. Byheart owns action validation, policy, receipts, evidence, and the
 * resulting trace; the external agent owns judgment.
 */
export class DiscoveryBridge {
  private readonly host: string;
  private readonly requestedPort: number;
  private readonly driverId: string;
  private server: Server | undefined;
  private listeningPort: number | undefined;
  private settled = false;
  private readonly completionPromise: Promise<DiscoveryTrace>;
  private resolveCompletion!: (trace: DiscoveryTrace) => void;
  private rejectCompletion!: (error: Error) => void;

  constructor(private readonly options: DiscoveryBridgeOptions) {
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 0;
    this.driverId = options.driverId ?? "codex";
    this.completionPromise = new Promise<DiscoveryTrace>((resolvePromise, rejectPromise) => {
      this.resolveCompletion = resolvePromise;
      this.rejectCompletion = rejectPromise;
    });
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? "/", `http://${request.headers.host ?? this.host}`);

        if (request.method === "GET" && url.pathname === "/") {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          response.end(await this.renderHome());
          return;
        }

        if (request.method === "GET" && url.pathname === "/v1/state") {
          const observation = await this.options.session.observe();
          json(response, 200, this.statePayload(observation));
          return;
        }

        if (request.method === "GET" && url.pathname === "/v1/screenshot") {
          const observation = await this.options.session.observe();
          const uri = observation.screenshot?.uri;
          if (!uri?.startsWith("file://")) {
            response.writeHead(404).end("no file-backed screenshot for this surface");
            return;
          }
          const bytes = await readFile(fileURLToPath(uri));
          response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
          response.end(bytes);
          return;
        }

        if (request.method === "POST" && url.pathname === "/v1/action") {
          const body = await readJsonBody(request);
          const action = parseAction(body.action);
          const note = optionalString(body.note);
          const result = await this.options.session.act(action, note, this.driverId);
          json(response, 200, {
            accepted: true,
            step: result.entry.step,
            action: toJsonValue(result.entry.action),
            receipt: toJsonValue(result.entry.receipt),
            observation: toJsonValue(result.observation),
          });
          return;
        }

        if (request.method === "POST" && url.pathname === "/v1/done") {
          const body = await readJsonBody(request);
          const checks = [];
          for (const condition of this.options.success) checks.push(await this.options.session.check(condition));
          if (!checks.every((check) => check.passed)) {
            json(response, 409, {
              accepted: false,
              reason: "declared success conditions have not passed",
              checks: toJsonValue(checks),
            });
            return;
          }
          const trace = await this.options.session.done(optionalString(body.note), this.driverId);
          if (!this.settled) {
            this.settled = true;
            this.resolveCompletion(trace);
          }
          json(response, 200, {
            accepted: true,
            runId: trace.runId,
            steps: trace.entries.length,
            finalObservation: toJsonValue(trace.finalObservation ?? null),
          });
          return;
        }

        if (request.method === "POST" && url.pathname === "/v1/stuck") {
          const body = await readJsonBody(request);
          const reason = requiredString(body.reason, "reason");
          try {
            await this.options.session.stuck(reason, this.driverId);
          } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            if (!this.settled) {
              this.settled = true;
              this.rejectCompletion(failure);
            }
            json(response, 409, { accepted: false, reason: failure.message });
          }
          return;
        }

        response.writeHead(404).end("not found");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        json(response, 400, { error: message });
      }
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const server = this.server!;
      server.once("error", rejectPromise);
      server.listen(this.requestedPort, this.host, () => {
        server.off("error", rejectPromise);
        const address = server.address();
        if (!address || typeof address === "string") {
          rejectPromise(new Error("discovery bridge did not expose a TCP address"));
          return;
        }
        this.listeningPort = address.port;
        resolvePromise();
      });
    });
  }

  url(): string {
    if (this.listeningPort === undefined) throw new Error("discovery bridge has not started");
    return `http://${this.host}:${this.listeningPort}`;
  }

  waitForCompletion(): Promise<DiscoveryTrace> {
    return this.completionPromise;
  }

  async close(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    this.listeningPort = undefined;
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => error ? rejectPromise(error) : resolvePromise());
    });
  }

  private statePayload(observation: Observation): JsonObject {
    return {
      protocol: "byheart-external-discovery/v1",
      runId: this.options.session.runId(),
      driver: this.driverId,
      goal: this.options.session.goal,
      target: toJsonValue(this.options.session.target),
      step: this.options.session.step(),
      maxSteps: this.options.session.stepLimit(),
      allowedActions: this.options.session.allowedActions(),
      observation: toJsonValue(observation),
      screenshotUrl: observation.screenshot?.uri.startsWith("file://") ? `${this.url()}/v1/screenshot` : null,
      actionEndpoint: `${this.url()}/v1/action`,
      doneEndpoint: `${this.url()}/v1/done`,
      stuckEndpoint: `${this.url()}/v1/stuck`,
      actionContract: {
        click: { kind: "click", target: { kind: "role|label|text|selector|point", fields: "target-specific" } },
        type: { kind: "type", target: { kind: "label", label: "..." }, text: "..." },
        select: { kind: "select", target: { kind: "label", label: "..." }, value: "..." },
        navigate: { kind: "navigate", url: "..." },
        wait: { kind: "wait", condition: { kind: "text_present", text: "..." }, timeoutMs: 5000 },
        semantic: { kind: "semantic", name: "adapter.action", args: {} },
      },
    };
  }

  private async renderHome(): Promise<string> {
    const observation = await this.options.session.observe();
    const screenshot = observation.screenshot?.uri.startsWith("file://")
      ? `<img src="/v1/screenshot?${Date.now()}" alt="Current target screenshot">`
      : "<p>This surface has no file-backed screenshot.</p>";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Byheart discovery bridge</title><style>
:root{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#11141a;color:#efede5}body{margin:0}header{padding:14px 20px;border-bottom:1px solid #4c5260;display:flex;justify-content:space-between}main{max-width:1100px;margin:28px auto;padding:0 20px}pre{white-space:pre-wrap;background:#181d25;border:1px solid #3d4450;padding:14px;max-height:36vh;overflow:auto}img{max-width:100%;border:1px solid #4c5260}code{color:#cbd4e5}</style></head><body><header><strong>BYHEART // EXTERNAL DISCOVERY</strong><span>${escapeHtml(this.driverId)}</span></header><main><h1>${escapeHtml(this.options.session.goal)}</h1><p>Step ${this.options.session.step()} / ${this.options.session.stepLimit()} · run ${escapeHtml(this.options.session.runId())}</p>${screenshot}<h2>Observation</h2><pre>${escapeHtml(observation.summary)}</pre><h2>Agent protocol</h2><pre>GET  /v1/state\nPOST /v1/action  {"action": {...}, "note": "..."}\nPOST /v1/done    {"note": "goal visibly complete"}\nPOST /v1/stuck   {"reason": "..."}</pre></main></body></html>`;
  }
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 1024 * 1024) throw new Error("request body exceeds 1 MiB");
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const value = text.length ? JSON.parse(text) as unknown : {};
  if (!isObject(value)) throw new Error("request body must be a JSON object");
  return value;
}

function parseAction(value: unknown): Action {
  const object = objectValue(value, "action");
  const kind = requiredString(object.kind, "action.kind");
  switch (kind) {
    case "navigate":
      return { kind, url: requiredString(object.url, "action.url"), ...riskAndDescription(object) };
    case "click":
      return { kind, target: parseLocator(object.target), ...riskAndDescription(object) };
    case "type": {
      const clear = object.clear;
      if (clear !== undefined && typeof clear !== "boolean") throw new Error("action.clear must be boolean");
      return {
        kind,
        target: parseLocator(object.target),
        text: requiredString(object.text, "action.text"),
        ...(clear === undefined ? {} : { clear }),
        ...riskAndDescription(object),
      };
    }
    case "select":
      return {
        kind,
        target: parseLocator(object.target),
        value: requiredString(object.value, "action.value"),
        ...riskAndDescription(object),
      };
    case "read": {
      const as = object.as;
      if (as !== undefined && !["string", "number", "boolean"].includes(String(as))) {
        throw new Error("action.as must be string, number, or boolean");
      }
      return {
        kind,
        target: parseLocator(object.target),
        ...(as === undefined ? {} : { as: as as "string" | "number" | "boolean" }),
        ...(typeof object.description === "string" ? { description: object.description } : {}),
      };
    }
    case "wait":
      return {
        kind,
        condition: parseCondition(object.condition),
        timeoutMs: finiteNumber(object.timeoutMs, "action.timeoutMs"),
        ...(typeof object.description === "string" ? { description: object.description } : {}),
      };
    case "semantic":
      return {
        kind,
        name: requiredString(object.name, "action.name"),
        ...(object.args === undefined ? {} : { args: jsonObject(object.args, "action.args") }),
        ...riskAndDescription(object),
      };
    default:
      throw new Error(`unsupported action kind: ${kind}`);
  }
}

function parseLocator(value: unknown): Locator {
  const object = objectValue(value, "target");
  const kind = requiredString(object.kind, "target.kind");
  switch (kind) {
    case "role":
      return { kind, role: requiredString(object.role, "target.role"), name: requiredString(object.name, "target.name"), ...exact(object) };
    case "label":
      return { kind, label: requiredString(object.label, "target.label"), ...exact(object) };
    case "text":
      return {
        kind,
        text: requiredString(object.text, "target.text"),
        ...(typeof object.context === "string" ? { context: object.context } : {}),
        ...exact(object),
      };
    case "selector":
      return {
        kind,
        selector: requiredString(object.selector, "target.selector"),
        ...(typeof object.rationale === "string" ? { rationale: object.rationale } : {}),
      };
    case "point":
      return {
        kind,
        x: finiteNumber(object.x, "target.x"),
        y: finiteNumber(object.y, "target.y"),
        coordinateSpace: "surface",
      };
    case "semantic":
      return {
        kind,
        name: requiredString(object.name, "target.name"),
        ...(object.args === undefined ? {} : { args: jsonObject(object.args, "target.args") }),
      };
    default:
      throw new Error(`unsupported target kind: ${kind}`);
  }
}

function parseCondition(value: unknown): Condition {
  const object = objectValue(value, "condition");
  const kind = requiredString(object.kind, "condition.kind");
  switch (kind) {
    case "exists":
      return { kind, target: parseLocator(object.target) };
    case "text_present":
      return { kind, text: requiredString(object.text, "condition.text") };
    case "text_equals":
      return { kind, target: parseLocator(object.target), value: requiredString(object.value, "condition.value") };
    case "url_matches":
      return { kind, pattern: requiredString(object.pattern, "condition.pattern") };
    case "state_equals":
      return { kind, path: requiredString(object.path, "condition.path"), value: toJsonValue(object.value) };
    case "semantic":
      return {
        kind,
        name: requiredString(object.name, "condition.name"),
        ...(object.args === undefined ? {} : { args: jsonObject(object.args, "condition.args") }),
      };
    default:
      throw new Error(`unsupported condition kind: ${kind}`);
  }
}

function riskAndDescription(object: Record<string, unknown>): { risk?: "safe" | "consequential"; description?: string } {
  const risk = object.risk;
  if (risk !== undefined && risk !== "safe" && risk !== "consequential") {
    throw new Error("action.risk must be safe or consequential");
  }
  return {
    ...(risk === undefined ? {} : { risk }),
    ...(typeof object.description === "string" ? { description: object.description } : {}),
  };
}

function exact(object: Record<string, unknown>): { exact?: boolean } {
  if (object.exact === undefined) return {};
  if (typeof object.exact !== "boolean") throw new Error("target.exact must be boolean");
  return { exact: object.exact };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${name} must be an object`);
  return value;
}

function jsonObject(value: unknown, name: string): JsonObject {
  if (!isObject(value)) throw new Error(`${name} must be a JSON object`);
  return toJsonValue(value) as JsonObject;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function json(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value, null, 2));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
