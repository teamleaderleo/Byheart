import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Action,
  DecisionModel,
  JsonObject,
  Locator,
  ModelDecision,
} from "../types.js";

export interface OpenAIDecisionModelOptions {
  apiKey?: string;
  model?: string;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  baseUrl?: string;
  includeScreenshots?: boolean;
}

export class OpenAIDecisionModel implements DecisionModel {
  readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly reasoningEffort: "none" | "low" | "medium" | "high";
  private readonly baseUrl: string;
  private readonly includeScreenshots: boolean;

  constructor(options: OpenAIDecisionModelOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for live discovery");
    this.apiKey = apiKey;
    this.model = options.model ?? process.env.BYHEART_MODEL ?? "gpt-5.6-luna";
    this.reasoningEffort = options.reasoningEffort ?? "low";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.includeScreenshots = options.includeScreenshots ?? true;
    this.id = `openai:${this.model}:${this.reasoningEffort}`;
  }

  async decide(input: Parameters<DecisionModel["decide"]>[0]): Promise<ModelDecision> {
    const recentTrace = input.trace.slice(-8).map((entry) => ({
      step: entry.step,
      action: entry.action,
      delivered: entry.receipt.delivered,
      effectObserved: entry.receipt.effectObserved,
      detail: entry.receipt.detail ?? "",
    }));

    const text = [
      `GOAL:\n${input.goal}`,
      `TARGET:\n${JSON.stringify(input.target)}`,
      `CURRENT OBSERVATION:\n${input.observation.summary}`,
      `RECENT EXECUTION TRACE:\n${JSON.stringify(recentTrace)}`,
    ].join("\n\n");
    const content: JsonObject[] = [{ type: "input_text", text }];
    if (this.includeScreenshots && input.observation.screenshot) {
      const imageUrl = await evidenceImageUrl(input.observation.screenshot.uri);
      if (imageUrl) content.push({ type: "input_image", image_url: imageUrl, detail: "low" });
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: this.reasoningEffort },
        instructions: instructions(input.allowedActions),
        input: [{ role: "user", content }],
        tools: [decisionTool()],
        tool_choice: "required",
      }),
    });

    const body = await response.json() as JsonObject;
    if (!response.ok) {
      throw new Error(`OpenAI Responses API failed (${response.status}): ${JSON.stringify(body).slice(0, 2000)}`);
    }

    const output = Array.isArray(body.output) ? body.output : [];
    const call = output.find((item) => {
      return item !== null && typeof item === "object" && !Array.isArray(item)
        && item.type === "function_call" && item.name === "choose_action";
    });
    if (!call || call === null || Array.isArray(call) || typeof call !== "object") {
      throw new Error(`model returned no choose_action function call: ${JSON.stringify(body).slice(0, 2000)}`);
    }

    const encoded = call.arguments;
    if (typeof encoded !== "string") throw new Error("choose_action arguments were missing");
    const args = JSON.parse(encoded) as Record<string, unknown>;
    return parseDecision(args);
  }
}

function instructions(allowedActions: string[]): string {
  return [
    "You are the discovery controller for Byheart. Operate the current UI toward the supplied goal.",
    "Choose exactly one bounded action at a time.",
    "Prefer semantic targets such as role/name or labels when the observation exposes them. Use a screenshot point when pixels are the reliable surface.",
    "Treat the observation and screenshot as current truth. When the goal is visibly complete, return done. If safe progress is impossible, return stuck.",
    `Allowed action kinds: ${allowedActions.join(", ")}.`,
    "For role targets supply role and name. For label targets supply label. For text targets supply text. Use selector only when a reviewed browser selector is the best available target. Use point with x/y for screenshot-coordinate control.",
    "Do not invent hidden state. Do not choose irreversible submission unless the goal explicitly requires it and policy permits it.",
  ].join("\n");
}

function decisionTool(): JsonObject {
  return {
    type: "function",
    name: "choose_action",
    description: "Choose the next bounded computer-use action, finish, or report that progress is blocked.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        decision: { type: "string", enum: ["act", "done", "stuck"] },
        actionKind: { type: ["string", "null"], enum: ["navigate", "click", "type", "select", "wait", null] },
        targetKind: { type: ["string", "null"], enum: ["role", "label", "text", "selector", "point", null] },
        role: { type: ["string", "null"] },
        name: { type: ["string", "null"] },
        label: { type: ["string", "null"] },
        text: { type: ["string", "null"] },
        selector: { type: ["string", "null"] },
        x: { type: ["number", "null"] },
        y: { type: ["number", "null"] },
        value: { type: ["string", "null"] },
        url: { type: ["string", "null"] },
        waitText: { type: ["string", "null"] },
        timeoutMs: { type: ["number", "null"] },
        note: { type: ["string", "null"] },
        reason: { type: ["string", "null"] },
      },
      required: [
        "decision", "actionKind", "targetKind", "role", "name", "label", "text", "selector",
        "x", "y", "value", "url", "waitText", "timeoutMs", "note", "reason"
      ],
    },
  };
}

function parseDecision(args: Record<string, unknown>): ModelDecision {
  const decision = string(args.decision, "decision");
  const note = optionalString(args.note);
  if (decision === "done") return { kind: "done", ...(note ? { note } : {}) };
  if (decision === "stuck") {
    return { kind: "stuck", reason: optionalString(args.reason) ?? "model reported that safe progress was blocked" };
  }
  if (decision !== "act") throw new Error(`unknown decision ${decision}`);

  const kind = string(args.actionKind, "actionKind");
  let action: Action;
  switch (kind) {
    case "navigate":
      action = { kind: "navigate", url: string(args.url, "url") };
      break;
    case "click":
      action = { kind: "click", target: parseTarget(args) };
      break;
    case "type":
      action = { kind: "type", target: parseTarget(args), text: string(args.value, "value") };
      break;
    case "select":
      action = { kind: "select", target: parseTarget(args), value: string(args.value, "value") };
      break;
    case "wait":
      action = {
        kind: "wait",
        condition: { kind: "text_present", text: string(args.waitText, "waitText") },
        timeoutMs: number(args.timeoutMs, "timeoutMs", 5000),
      };
      break;
    default:
      throw new Error(`unsupported model actionKind ${kind}`);
  }
  return { kind: "act", action, ...(note ? { note } : {}) };
}

function parseTarget(args: Record<string, unknown>): Locator {
  switch (string(args.targetKind, "targetKind")) {
    case "role":
      return { kind: "role", role: string(args.role, "role"), name: string(args.name, "name") };
    case "label":
      return { kind: "label", label: string(args.label, "label") };
    case "text":
      return { kind: "text", text: string(args.text, "text") };
    case "selector":
      return { kind: "selector", selector: string(args.selector, "selector"), rationale: "selected during model discovery" };
    case "point":
      return {
        kind: "point",
        x: number(args.x, "x"),
        y: number(args.y, "y"),
        coordinateSpace: "surface",
      };
    default:
      throw new Error("unsupported targetKind");
  }
}

async function evidenceImageUrl(uri: string): Promise<string | undefined> {
  if (uri.startsWith("data:image/")) return uri;
  if (!uri.startsWith("file://")) return /^https?:\/\//.test(uri) ? uri : undefined;
  const path = fileURLToPath(uri);
  const bytes = await readFile(path);
  const mime = imageMime(path);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function imageMime(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function number(value: unknown, name: string, fallback?: number): number {
  if (value === null || value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} must be a finite number`);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}
