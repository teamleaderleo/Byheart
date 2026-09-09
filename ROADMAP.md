# Byheart roadmap

This roadmap is intentionally ambitious. The interview submission remains a clean browser slice; the project can go considerably further afterward.

## Phase 0 — executable core

Status: implemented.

- capability schema;
- input validation and templating;
- deterministic replay;
- typed result union;
- known outcomes;
- retries and recovery seams;
- action policy;
- evidence redaction;
- human-ownership state machine;
- discovery-model interface;
- trace compiler;
- scripted adapter and tests.

## Phase 1 — browser take-home slice

Status: implemented except for retaining one final real discovery evidence run for submission.

- local legacy-style browser target;
- Playwright surface adapter;
- cross-frame semantic targeting;
- model/agent observe → decide → act discovery;
- successful-trace compilation;
- deterministic replay with parameters;
- known domain outcome;
- recoverable runtime condition;
- hard failure evidence;
- consequential action routed to human;
- same-session operator takeover/resume;
- exact seven-heading report.

Exit: one teach run, one replay run, one exceptional replay, and retained evidence.

## Phase 1.5 — Codex-first resident discovery

Status: implemented as the preferred discovery path.

Byheart owns a resident live session and a tiny local protocol. Codex owns judgment.

```text
GET  /v1/state
POST /v1/action
POST /v1/done
POST /v1/stuck
```

Goals:

- remove API credentials from the normal project path;
- keep model/provider choice outside the capability engine;
- let Codex inspect repository source and runtime evidence while teaching;
- make ChatGPT computer use, local models, humans, and future agents interchangeable discovery drivers;
- preserve one action/receipt/observation chain no matter which agent chose the action.

Next improvements:

- MCP wrapper over the same discovery session;
- richer screenshot/image handoff for pixel-first agents;
- explicit capability proposal/review before promotion;
- external-agent identity/version in provenance;
- session attach/reconnect after an agent restart.

## Phase 2 — capability quality

- locator candidates with confidence/rationale;
- compatibility fingerprints;
- artifact approval states (`draft`, `approved`, `quarantined`);
- N-run stability score;
- execution receipts bound to artifact/version/surface identity;
- artifact diff/review UI;
- bounded single-step recovery by an external reasoning agent;
- compiler that discovers parameter candidates from repeated traces;
- capability composition;
- capability retirement when replay evidence degrades;
- counterexample/failure corpus attached to each capability family.

## Phase 3 — remote desktop

Status: adapter contract and HTTP transport implemented; real environment hookup remains.

The remote surface uses one exact session identity plus frame and input operations. It is the lowest-common-denominator path into native software and VMs.

Next:

- connect the existing x86 Linux desktop path;
- connect the Windows VM / Moonlight path;
- pointer movement/click/drag;
- keyboard/text/hotkeys;
- exact resolution and scale metadata;
- screenshot evidence;
- operator takeover on the same remote session;
- optional guest helper for semantic observations/actions;
- detect session/resolution changes and fail closed;
- prove one native workflow with no DOM.

Useful future refinement: keep the visual channel active even when a guest helper exists. Semantic state can be incomplete; pixels are an independent witness.

## Phase 4 — Preflight / Starsector

Status: Byheart adapter for Preflight's existing runtime state + closed action protocol implemented; broader gameplay action catalog remains in Preflight.

Responsibility split:

```text
Preflight
  exact game/process/save/profile identity
  reviewed in-JVM semantic actions
  telemetry / checkpoints / containment

Byheart
  agent-facing observations
  learned UI procedures
  planning
  short-horizon skills
  checkpoint search
  capability compilation
```

First useful capabilities:

- continue/load exact checkpoint copy;
- pause/resume/time-step;
- open/close major campaign UI surfaces;
- set/correct destination;
- interact with market/fleet;
- toggle reviewed abilities;
- trade-screen procedures;
- safe save/quit/reset.

Observation bundle to grow toward:

- screenshot;
- exact game/process/save/profile identity;
- campaign location and destination;
- credits/cargo/fuel/supplies;
- nearby fleets, burn, sensor profile/strength, and detection state;
- current dialog/surface;
- ability availability;
- relevant market/opportunity facts.

First research experiments:

1. teach/replay one market interaction;
2. travel to a destination in pause/resume increments;
3. patrol evasion with short replanning windows;
4. compare several escape plans from one checkpoint;
5. simple smuggling trip;
6. combine trade + mission + acquisition opportunities on one route;
7. planner chooses between immediate profit and a strategically valuable blueprint/hullmod/hull;
8. measure how many strong-agent decisions disappear as capabilities accumulate.

Combat can initially lean on Starsector autopilot. The campaign layer already contains rich decisions and real UI work.

## Phase 5 — deterministic Starsector advisor

Build read-only mathematical helpers that reduce agent burden.

Candidate calculations:

- market margin and net trip profit;
- cargo/fuel/supply feasibility;
- travel cost and deadline slack;
- route overlap among missions/opportunities;
- acquisition detour cost;
- sensor/interception geometry;
- patrol escape feasibility;
- fleet-strength estimates;
- expected replacement/refit cost;
- rarity and strategic-option tags for blueprints/hulls/weapons;
- Pareto frontier across money/time/risk/strategic value.

Feed the planner a small ranked opportunity frontier while preserving exact source facts underneath it.

## Phase 6 — checkpoint search and policy distillation

This is where Byheart starts short-circuiting primitive reinforcement learning.

- fork several plans from one checkpoint;
- score hard outcomes;
- let a strong model judge strategic residue;
- retain traces and causal differences;
- promote recurring successful decisions into explicit heuristics;
- promote routine heuristics into deterministic evaluators;
- keep provenance from rule back to runs;
- use learned capabilities as the action space for later search/RL;
- compare large-model, small-model, heuristic, and deterministic control at the same decision boundary.

A useful progression:

```text
strong agent reasons from scratch
        ↓
strong agent invokes learned skills
        ↓
cheaper agent selects among skills
        ↓
deterministic evaluator handles routine cases
        ↓
strong agent sees only novelty / conflict / strategic ambiguity
```

Exit: repeated play measurably reduces strong-agent intervention per accepted objective.

## Phase 7 — event-driven campaign control

Treat pause and time progression as first-class actions.

- pause;
- resume for a bounded interval;
- resume until a semantic trigger;
- normal/double speed where appropriate;
- pause when interception margin drops;
- pause on new hostile, dialog, destination change, low resource threshold, or valuable event;
- compile successful short-horizon movement procedures.

This lets a comparatively slow planner play a real-time campaign by turning important moments into explicit decision boundaries.

## Phase 8 — Battle Brothers

Build a second game adapter to test transfer of the Byheart model.

- turn-state observation;
- tactical action catalog;
- UI execution capabilities;
- recruit/equipment/contract evaluators;
- checkpointed battle comparison;
- tactical policy compilation;
- company-level long-horizon planning.

Battle Brothers is attractive because combat already pauses at every decision.

## Phase 9 — learned capability ecosystem

Longer-term possibilities:

- capability catalog exposed as agent tools;
- capability dependency graph;
- automatic specialization by app/game version;
- cross-machine capability portability;
- model routing based on uncertainty and consequence;
- skill arbitration when several capabilities apply;
- human interventions compiled into candidate repairs;
- transfer learning between related applications;
- experiment ledger showing which behavior became deterministic and why;
- replay-derived confidence that decays when observations diverge;
- a capability optimizer that replaces long traces with smaller equivalent procedures;
- a curriculum where successful higher-level procedures create the action vocabulary for future learning.

## Success metrics

For a repeated family of tasks, track:

```text
strong-agent decisions per accepted result
human interventions per accepted result
replay success rate
latency / compute cost
capability reuse count
unknown-state rate
checkpoint attempts per improvement
fraction of actions executed deterministically
```

Byheart gets better when useful work migrates toward cheaper, more predictable execution while unusual situations remain visible to the agent or human who can actually judge them.
