import type { JsonObject, JsonValue } from "./types.js";

export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function toJsonObject(value: unknown): JsonObject {
  const rendered = toJsonValue(value);
  if (rendered === null || Array.isArray(rendered) || typeof rendered !== "object") {
    return { value: rendered };
  }
  return rendered;
}
