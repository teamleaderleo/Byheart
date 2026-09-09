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
  if (allowed.endsWith("*")) return actual.startsWith(allowed.slice(0, -1));
  return actual === allowed;
}

function actionConsequenceKey(action: Action): string | undefined {
  if (action.kind === "semantic") return action.name;
  if (action.kind === "navigate") return action.url;
  return action.kind;
}
