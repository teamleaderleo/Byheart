import { DiscoverySession } from "./discovery-session.js";
import type {
  DecisionModel,
  DiscoveryTrace,
  EvidenceSink,
  Surface,
  SurfaceTarget,
} from "./types.js";

export interface DiscoveryOptions {
  maxSteps?: number;
  allowedActions: import("./types.js").ActionKind[];
  consequentialPolicy?: "block" | "require_human" | "allow";
  now?: () => Date;
}

/**
 * Convenience runner for a model that implements DecisionModel. The durable
 * discovery semantics live in DiscoverySession so the same trace/policy path is
 * used when Codex or another external agent drives the session over the bridge.
 */
export class DiscoveryRunner {
  constructor(
    private readonly surface: Surface,
    private readonly model: DecisionModel,
    private readonly evidence: EvidenceSink,
  ) {}

  async run(goal: string, target: SurfaceTarget, options: DiscoveryOptions): Promise<DiscoveryTrace> {
    const session = new DiscoverySession(this.surface, this.evidence, goal, target, {
      ...options,
      driverId: this.model.id,
    });

    for (let step = 1; step <= (options.maxSteps ?? 30); step += 1) {
      const observation = await session.observe();
      const decision = await this.model.decide({
        goal,
        target,
        observation,
        trace: session.trace().entries,
        allowedActions: options.allowedActions,
      });

      if (decision.kind === "done") return session.done(decision.note, this.model.id);
      if (decision.kind === "stuck") {
        await session.stuck(decision.reason, this.model.id);
        throw new Error("unreachable");
      }

      await session.act(decision.action, decision.note, this.model.id);
    }

    throw new Error(`discovery exceeded maxSteps=${options.maxSteps ?? 30}`);
  }
}
