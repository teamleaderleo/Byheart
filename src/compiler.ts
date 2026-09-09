import type {
  Capability,
  CapabilityPolicy,
  Condition,
  DiscoveryTrace,
  ExtractionRule,
  JsonPrimitive,
  ValueSchema,
} from "./types.js";

export interface CompileOptions {
  id: string;
  name: string;
  version?: number;
  description?: string;
  inputs?: Record<string, ValueSchema>;
  outputs?: Record<string, ValueSchema>;
  success: Condition[];
  extraction?: ExtractionRule[];
  policy?: Partial<CapabilityPolicy>;
  model?: string;
  parameterize?: Record<string, JsonPrimitive>;
}

export function compileTrace(trace: DiscoveryTrace, options: CompileOptions): Capability {
  const allowedActions = Array.from(new Set(trace.entries.map((entry) => entry.action.kind)));
  const parameterizedSteps = trace.entries.map((entry, index) => ({
    id: `step-${String(index + 1).padStart(2, "0")}`,
    action: parameterize(entry.action, options.parameterize ?? {}),
  }));

  return {
    format: "byheart-capability/v1",
    id: options.id,
    name: options.name,
    version: options.version ?? 1,
    ...(options.description ? { description: options.description } : {}),
    target: trace.target,
    inputs: options.inputs ?? {},
    outputs: options.outputs ?? {},
    steps: parameterizedSteps,
    success: options.success,
    ...(options.extraction ? { extraction: options.extraction } : {}),
    policy: {
      allowedAdapters: options.policy?.allowedAdapters ?? [trace.target.adapter],
      allowedActions: options.policy?.allowedActions ?? allowedActions,
      ...(options.policy?.allowedEntrypoints
        ? { allowedEntrypoints: options.policy.allowedEntrypoints }
        : trace.target.entrypoint
          ? { allowedEntrypoints: [trace.target.entrypoint] }
          : {}),
      ...(options.policy?.consequentialActions
        ? { consequentialActions: options.policy.consequentialActions }
        : {}),
      consequentialPolicy: options.policy?.consequentialPolicy ?? "require_human",
    },
    provenance: {
      discoveredRunId: trace.runId,
      createdAt: new Date().toISOString(),
      ...(options.model ? { model: options.model } : {}),
    },
  };
}

function parameterize<T>(value: T, bindings: Record<string, JsonPrimitive>): T {
  const json = JSON.stringify(value);
  let rendered = json;
  for (const [name, concrete] of Object.entries(bindings)) {
    const encoded = JSON.stringify(concrete);
    const replacement = JSON.stringify(`{{input.${name}}}`);
    rendered = rendered.split(encoded).join(replacement);
  }
  return JSON.parse(rendered) as T;
}
