import { validateCapability } from "./artifact.js";
import type { Capability, JsonObject, ValueSchema } from "./types.js";

export interface CapabilityReference {
  id: string;
  version?: number;
}

export interface CapabilitySummary {
  id: string;
  name: string;
  version: number;
  description?: string;
  adapter: string;
  inputs: Record<string, ValueSchema>;
  outputs: Record<string, ValueSchema>;
  provenance?: Capability["provenance"];
}

export interface CapabilityToolDescriptor extends JsonObject {
  name: string;
  description: string;
  capabilityId: string;
  capabilityVersion: number;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
}

/**
 * Versioned executable vocabulary for planners. Discovery can add candidates;
 * a reviewer/promotion layer can decide which artifacts enter a production
 * catalog later. The catalog itself never silently changes an invocation to a
 * different version when a version was requested explicitly.
 */
export class CapabilityCatalog {
  private readonly byId = new Map<string, Map<number, Capability>>();

  constructor(capabilities: Capability[] = []) {
    for (const capability of capabilities) this.add(capability);
  }

  add(capability: Capability): void {
    validateCapability(capability);
    let versions = this.byId.get(capability.id);
    if (!versions) {
      versions = new Map<number, Capability>();
      this.byId.set(capability.id, versions);
    }
    if (versions.has(capability.version)) {
      throw new Error(`capability ${capability.id}@${capability.version} already exists`);
    }
    versions.set(capability.version, structuredClone(capability));
  }

  has(reference: CapabilityReference): boolean {
    try {
      this.get(reference);
      return true;
    } catch {
      return false;
    }
  }

  get(reference: CapabilityReference): Capability {
    const versions = this.byId.get(reference.id);
    if (!versions || versions.size === 0) throw new Error(`unknown capability: ${reference.id}`);
    const version = reference.version ?? Math.max(...versions.keys());
    const capability = versions.get(version);
    if (!capability) throw new Error(`unknown capability version: ${reference.id}@${version}`);
    return structuredClone(capability);
  }

  list(): CapabilitySummary[] {
    const values: CapabilitySummary[] = [];
    for (const [id, versions] of this.byId) {
      for (const version of [...versions.keys()].sort((a, b) => a - b)) {
        const capability = versions.get(version)!;
        values.push(summary(capability));
      }
    }
    return values.sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version);
  }

  latest(): CapabilitySummary[] {
    return [...this.byId.keys()]
      .sort()
      .map((id) => summary(this.get({ id })));
  }

  tools(): CapabilityToolDescriptor[] {
    return this.latest().map((item) => ({
      name: toolName(item.id),
      description: item.description ?? item.name,
      capabilityId: item.id,
      capabilityVersion: item.version,
      inputSchema: schemasAsJson(item.inputs),
      outputSchema: schemasAsJson(item.outputs),
    }));
  }
}

function summary(capability: Capability): CapabilitySummary {
  return {
    id: capability.id,
    name: capability.name,
    version: capability.version,
    ...(capability.description ? { description: capability.description } : {}),
    adapter: capability.target.adapter,
    inputs: structuredClone(capability.inputs),
    outputs: structuredClone(capability.outputs),
    ...(capability.provenance ? { provenance: structuredClone(capability.provenance) } : {}),
  };
}

function schemasAsJson(schemas: Record<string, ValueSchema>): JsonObject {
  return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, {
    type: schema.type,
    required: schema.required !== false,
    description: schema.description ?? "",
    enum: schema.enum ?? [],
    sensitive: schema.sensitive === true,
  }]));
}

function toolName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "capability";
}
