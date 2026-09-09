import { randomUUID } from "node:crypto";
import type { JsonObject } from "./types.js";

export interface SearchCandidate {
  id: string;
  payload: JsonObject;
  parents?: string[];
  note?: string;
}

export interface SearchObjective {
  metric: string;
  direction: "maximize" | "minimize";
  weight?: number;
}

export interface CandidateEvaluation {
  candidate: SearchCandidate;
  result: JsonObject;
  metrics: Record<string, number>;
  utility: number;
  startedAt: string;
  finishedAt: string;
}

export interface CheckpointSearchResult {
  format: "byheart-checkpoint-search-result/v1";
  runId: string;
  checkpoint: JsonObject;
  objectives: SearchObjective[];
  evaluations: CandidateEvaluation[];
  paretoFrontier: string[];
  bestByUtility?: string;
}

export interface CheckpointEnvironment {
  /** Restore the exact baseline before each candidate. */
  restore(checkpoint: JsonObject): Promise<void>;
  /** Execute one already-proposed candidate from the restored baseline. */
  execute(candidate: SearchCandidate): Promise<JsonObject>;
  /** Return comparable numeric metrics for the candidate result. */
  score(result: JsonObject, candidate: SearchCandidate): Promise<Record<string, number>>;
}

export interface CheckpointSearchOptions {
  runId?: string;
  now?: () => Date;
  onEvaluation?: (evaluation: CandidateEvaluation) => void | Promise<void>;
}

/**
 * Evaluates several plans from the same checkpoint. Candidate generation is
 * deliberately separate: Codex, a planner, a heuristic generator, or a later
 * search policy can propose candidates, while this runner makes the comparison
 * repeatable and keeps restore/execute/score semantics explicit.
 */
export class CheckpointSearchRunner {
  private readonly runId: string;
  private readonly now: () => Date;

  constructor(
    private readonly environment: CheckpointEnvironment,
    private readonly objectives: SearchObjective[],
    private readonly options: CheckpointSearchOptions = {},
  ) {
    this.runId = options.runId ?? randomUUID();
    this.now = options.now ?? (() => new Date());
    validateObjectives(objectives);
  }

  async run(checkpoint: JsonObject, candidates: SearchCandidate[]): Promise<CheckpointSearchResult> {
    validateCandidates(candidates);
    const evaluations: CandidateEvaluation[] = [];

    for (const candidate of candidates) {
      await this.environment.restore(structuredClone(checkpoint));
      const startedAt = this.now().toISOString();
      const result = await this.environment.execute(structuredClone(candidate));
      const metrics = await this.environment.score(result, candidate);
      validateMetrics(metrics, this.objectives, candidate.id);
      const evaluation: CandidateEvaluation = {
        candidate: structuredClone(candidate),
        result: structuredClone(result),
        metrics: { ...metrics },
        utility: utility(metrics, this.objectives),
        startedAt,
        finishedAt: this.now().toISOString(),
      };
      evaluations.push(evaluation);
      await this.options.onEvaluation?.(structuredClone(evaluation));
    }

    const frontier = paretoFrontier(evaluations, this.objectives).map((evaluation) => evaluation.candidate.id);
    const best = evaluations.length
      ? [...evaluations].sort((a, b) => b.utility - a.utility || a.candidate.id.localeCompare(b.candidate.id))[0]
      : undefined;

    return {
      format: "byheart-checkpoint-search-result/v1",
      runId: this.runId,
      checkpoint: structuredClone(checkpoint),
      objectives: structuredClone(this.objectives),
      evaluations,
      paretoFrontier: frontier,
      ...(best ? { bestByUtility: best.candidate.id } : {}),
    };
  }
}

export function paretoFrontier(
  evaluations: CandidateEvaluation[],
  objectives: SearchObjective[],
): CandidateEvaluation[] {
  return evaluations.filter((candidate) => !evaluations.some((other) => {
    if (other === candidate) return false;
    return dominates(other.metrics, candidate.metrics, objectives);
  }));
}

export function dominates(
  a: Record<string, number>,
  b: Record<string, number>,
  objectives: SearchObjective[],
): boolean {
  let strictlyBetter = false;
  for (const objective of objectives) {
    const left = directed(a[objective.metric]!, objective.direction);
    const right = directed(b[objective.metric]!, objective.direction);
    if (left < right) return false;
    if (left > right) strictlyBetter = true;
  }
  return strictlyBetter;
}

export function utility(metrics: Record<string, number>, objectives: SearchObjective[]): number {
  return objectives.reduce((sum, objective) => {
    const value = directed(metrics[objective.metric]!, objective.direction);
    return sum + value * (objective.weight ?? 1);
  }, 0);
}

function directed(value: number, direction: SearchObjective["direction"]): number {
  return direction === "maximize" ? value : -value;
}

function validateObjectives(objectives: SearchObjective[]): void {
  if (objectives.length === 0) throw new Error("checkpoint search needs at least one objective");
  const seen = new Set<string>();
  for (const objective of objectives) {
    if (!objective.metric.trim()) throw new Error("search objective metric is required");
    if (seen.has(objective.metric)) throw new Error(`duplicate search objective: ${objective.metric}`);
    seen.add(objective.metric);
    if (objective.weight !== undefined && !Number.isFinite(objective.weight)) {
      throw new Error(`objective weight must be finite: ${objective.metric}`);
    }
  }
}

function validateCandidates(candidates: SearchCandidate[]): void {
  if (candidates.length === 0) throw new Error("checkpoint search needs at least one candidate");
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.id.trim()) throw new Error("candidate id is required");
    if (seen.has(candidate.id)) throw new Error(`duplicate candidate id: ${candidate.id}`);
    seen.add(candidate.id);
  }
}

function validateMetrics(
  metrics: Record<string, number>,
  objectives: SearchObjective[],
  candidateId: string,
): void {
  for (const objective of objectives) {
    const value = metrics[objective.metric];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`candidate ${candidateId} has invalid metric ${objective.metric}`);
    }
  }
}
