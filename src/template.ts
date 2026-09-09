import type { JsonObject, JsonValue } from "./types.js";

const EXACT_TEMPLATE = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/;
const INLINE_TEMPLATE = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

export function resolvePath(root: JsonObject, path: string): JsonValue | undefined {
  const parts = path.split(".").filter(Boolean);
  let current: JsonValue = root;
  for (const part of parts) {
    if (current === null || Array.isArray(current) || typeof current !== "object") return undefined;
    const child: JsonValue | undefined = (current as JsonObject)[part];
    if (child === undefined) return undefined;
    current = child;
  }
  return current;
}

export function renderTemplate(value: JsonValue, context: JsonObject): JsonValue {
  if (typeof value === "string") {
    const exact = value.match(EXACT_TEMPLATE);
    if (exact?.[1]) {
      const resolved = resolvePath(context, exact[1]);
      if (resolved === undefined) throw new Error(`Unknown template variable: ${exact[1]}`);
      return resolved;
    }

    return value.replace(INLINE_TEMPLATE, (_, path: string) => {
      const resolved = resolvePath(context, path);
      if (resolved === undefined) throw new Error(`Unknown template variable: ${path}`);
      if (resolved === null) return "null";
      if (typeof resolved === "object") return JSON.stringify(resolved);
      return String(resolved);
    });
  }

  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, context));

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderTemplate(item, context)]),
    );
  }

  return value;
}

export function renderObject<T>(value: T, context: JsonObject): T {
  return renderTemplate(value as unknown as JsonValue, context) as unknown as T;
}
