import type {
  Capability,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  ValueSchema,
} from "./types.js";

export class CapabilityValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid capability:\n- ${problems.join("\n- ")}`);
    this.name = "CapabilityValidationError";
  }
}

export function validateCapability(capability: Capability): void {
  const problems: string[] = [];

  if (capability.format !== "byheart-capability/v1") problems.push("unsupported format");
  if (!capability.id.trim()) problems.push("id is required");
  if (!capability.name.trim()) problems.push("name is required");
  if (!Number.isInteger(capability.version) || capability.version < 1) {
    problems.push("version must be a positive integer");
  }
  if (!capability.target.adapter.trim()) problems.push("target.adapter is required");
  if (capability.steps.length === 0) problems.push("at least one step is required");
  if (capability.success.length === 0) problems.push("at least one success checkpoint is required");

  const ids = new Set<string>();
  for (const step of capability.steps) {
    if (!step.id.trim()) problems.push("every step needs an id");
    if (ids.has(step.id)) problems.push(`duplicate step id: ${step.id}`);
    ids.add(step.id);
  }

  for (const [name, schema] of Object.entries(capability.inputs)) {
    validateSchema(`input ${name}`, schema, problems);
  }
  for (const [name, schema] of Object.entries(capability.outputs)) {
    validateSchema(`output ${name}`, schema, problems);
  }

  for (const rule of capability.extraction ?? []) {
    if (!(rule.output in capability.outputs)) {
      problems.push(`extraction references undeclared output: ${rule.output}`);
    }
    if (!rule.target && !rule.fromStatePath) {
      problems.push(`extraction ${rule.output} needs target or fromStatePath`);
    }
  }

  if (!capability.policy.allowedAdapters.includes(capability.target.adapter)) {
    problems.push("policy.allowedAdapters must include target.adapter");
  }

  if (problems.length) throw new CapabilityValidationError(problems);
}

function validateSchema(name: string, schema: ValueSchema, problems: string[]): void {
  if (!(["string", "number", "boolean"] as string[]).includes(schema.type)) {
    problems.push(`${name} has unsupported type: ${schema.type}`);
  }
  if (schema.enum) {
    for (const value of schema.enum) {
      if (!matchesType(value, schema.type)) {
        problems.push(`${name} enum contains value of wrong type: ${String(value)}`);
      }
    }
  }
}

function matchesType(value: JsonPrimitive, type: ValueSchema["type"]): boolean {
  return value !== null && typeof value === type;
}

export function validateInputs(
  schemas: Record<string, ValueSchema>,
  inputs: Record<string, JsonValue>,
): string[] {
  const problems: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    const value = inputs[name];
    const required = schema.required !== false;
    if (value === undefined) {
      if (required) problems.push(`missing required input: ${name}`);
      continue;
    }

    if (value === null || Array.isArray(value) || typeof value === "object") {
      problems.push(`input ${name} must be ${schema.type}`);
      continue;
    }

    if (typeof value !== schema.type) {
      problems.push(`input ${name} must be ${schema.type}; observed ${typeof value}`);
      continue;
    }

    if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
      problems.push(`input ${name} must be one of ${schema.enum.map(String).join(", ")}`);
    }
  }

  for (const name of Object.keys(inputs)) {
    if (!(name in schemas)) problems.push(`undeclared input: ${name}`);
  }

  return problems;
}

export function inputContext(inputs: Record<string, JsonValue>): JsonObject {
  return { input: inputs };
}
