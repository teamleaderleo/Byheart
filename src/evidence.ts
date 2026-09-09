import { createHash } from "node:crypto";
import type {
  EvidenceEvent,
  EvidenceRef,
  EvidenceSink,
  JsonObject,
  JsonValue,
} from "./types.js";

export class MemoryEvidenceSink implements EvidenceSink {
  private readonly events: EvidenceEvent[] = [];

  async record(event: EvidenceEvent): Promise<void> {
    this.events.push(redactEvent(event));
  }

  refs(): EvidenceRef[] {
    if (this.events.length === 0) return [];
    const payload = this.jsonl();
    const digest = createHash("sha256").update(payload).digest("hex");
    return [
      {
        kind: "log",
        uri: `memory://evidence/${digest}`,
        sha256: digest,
        description: `${this.events.length} structured run events`,
      },
    ];
  }

  snapshot(): readonly EvidenceEvent[] {
    return this.events;
  }

  jsonl(): string {
    return this.events.map((event) => JSON.stringify(event)).join("\n") + "\n";
  }
}

export function redactEvent(event: EvidenceEvent): EvidenceEvent {
  return {
    ...event,
    data: redactObject(event.data),
  };
}

export function redactObject(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactValue(key, item)]),
  );
}

function redactValue(key: string, value: JsonValue): JsonValue {
  const lower = key.toLowerCase();
  if (["password", "secret", "token", "credential", "authorization", "cookie"].some((needle) => lower.includes(needle))) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(key, item));
  if (value !== null && typeof value === "object") return redactObject(value);
  return value;
}
