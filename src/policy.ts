import type {
  Action,
  CapabilityPolicy,
  SurfaceIdentity,
} from "./types.js";

export type PolicyDecision =
  | { decision: "allow" }
  | { decision: "deny"; reason: string }
  | { decision: "require_human"; reason: string };

export function evaluatePolicy(
  policy: CapabilityPolicy,
  identity: SurfaceIdentity,
  action: Action,
): PolicyDecision {
  if (!policy.allowedAdapters.includes(identity.adapter)) {
    return { decision: "deny", reason: `adapter ${identity.adapter} is outside the allowlist` };
  }

  if (!policy.allowedActions.includes(action.kind)) {
    return { decision: "deny", reason: `action ${action.kind} is outside the allowlist` };
  }

  if (policy.allowedEntrypoints?.length && identity.entrypoint) {
    const allowed = policy.allowedEntrypoints.some((entry) => entrypointMatches(entry, identity.entrypoint!));
    if (!allowed) {
      return {
        decision: "deny",
        reason: `entrypoint ${identity.entrypoint} is outside the allowlist`,
      };
    }
  }

  if (action.kind === "navigate" && policy.allowedEntrypoints?.length) {
    const allowedDestination = policy.allowedEntrypoints.some((entry) => entrypointMatches(entry, action.url));
    if (!allowedDestination) {
      return {
        decision: "deny",
        reason: `navigation destination ${action.url} is outside the allowlist`,
      };
    }
  }

  const consequenceKey = actionConsequenceKey(action);
  const consequential =
    ("risk" in action && action.risk === "consequential") ||
    (consequenceKey !== undefined && policy.consequentialActions?.includes(consequenceKey));

  if (!consequential) return { decision: "allow" };

  if (policy.consequentialPolicy === "allow") return { decision: "allow" };
  if (policy.consequentialPolicy === "block") {
    return { decision: "deny", reason: `consequential action blocked: ${consequenceKey ?? action.kind}` };
  }
  return {
    decision: "require_human",
    reason: `consequential action requires human approval: ${consequenceKey ?? action.kind}`,
  };
}

function entrypointMatches(allowed: string, actual: string): boolean {
  if (allowed.endsWith("*")) {
    const allowedPrefix = normalizeUrlPrefix(allowed.slice(0, -1));
    return normalizeUrlPrefix(actual).startsWith(allowedPrefix);
  }

  try {
    const expected = new URL(allowed);
    const observed = new URL(actual);
    return expected.protocol === observed.protocol
      && expected.host === observed.host
      && normalizePath(expected.pathname) === normalizePath(observed.pathname)
      && expected.search === observed.search;
  } catch {
    return actual === allowed;
  }
}

function normalizeUrlPrefix(value: string): string {
  try {
    const url = new URL(value);
    const path = normalizePath(url.pathname);
    return `${url.protocol}//${url.host}${path === "/" ? "/" : path}${url.search}`;
  } catch {
    return value;
  }
}

function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  return path.replace(/\/+$/, "") || "/";
}

function actionConsequenceKey(action: Action): string | undefined {
  if (action.kind === "semantic") return action.name;
  if (action.kind === "navigate") return action.url;
  return action.kind;
}
