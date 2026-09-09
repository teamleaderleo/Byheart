# Byheart roadmap

This roadmap is intentionally ambitious. The first delivery still needs a clean vertical slice.

## Phase 0 — executable core

Status: foundation implemented.

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

Exit: `npm test` passes and `npm run demo` produces a successful replay with evidence.

## Phase 1 — take-home vertical slice

Build the complete assignment thread:

1. local legacy-style browser target;
2. Playwright surface adapter;
3. real LLM observe/decide/act loop;
4. compile successful trace into capability artifact;
5. deterministic replay with parameters and output extraction;
6. one known business outcome;
7. one recoverable runtime condition;
8. one hard failure with screenshot/trace;
9. consequential action routed to human;
10. minimal same-session operator takeover;
11. `/evidence/` populated from real discovery and replay runs;
12. `REPORT.md` completed under the exact seven required headings.

Exit: one command teaches; one command replays; one command demonstrates an exceptional outcome.

## Phase 2 — capability quality

- locator candidates with confidence/rationale;
- compatibility fingerprints;
- artifact approval states (`draft`, `approved`, `quarantined`);
- N-run stability score;
- execution receipts bound to artifact/version/surface identity;
- artifact diff/review UI;
- bounded LLM single-step recovery;
- compiler that discovers parameter candidates from repeated traces;
- capability composition.

## Phase 3 — remote desktop

Implement a real remote surface against the existing VM setup.

- screenshot stream;
- pointer movement/click/drag;
- keyboard/text input;
- exact remote session identity;
- resolution/coordinate-space metadata;
- pause/takeover/resume;
- evidence frames;
- optional guest helper for semantic state/actions.

Test targets:

- x86 Linux desktop;
- Windows VM;
- Moonlight session;
- one ordinary native app;
- one awkward application where accessibility is weak.

Exit: teach and replay a useful native/VM workflow with no browser DOM.

## Phase 4 — Preflight / Starsector

Treat Preflight as the lower game-control layer and Byheart as the planner/skill layer.

First capabilities:

- continue/load exact checkpoint copy;
- open/close major campaign UI surfaces;
- pause/resume/time-step;
- set destination;
- interact with market/fleet;
- toggle reviewed abilities;
- trade-screen procedures;
- safe save/quit/reset.

Observation bundle:

- screenshot;
- exact game/process/save/profile identity;
- campaign location;
- credits/cargo/fuel/supplies;
- nearby fleets and sensor facts;
- current dialog/surface;
- destination and movement state;
- relevant ability availability.

First research experiments:

1. teach/replay one market interaction;
2. checkpointed route to a destination;
3. patrol-evasion in pause/resume increments;
4. compare several escape plans from one checkpoint;
5. simple smuggling trip;
6. planner chooses between immediate profit and strategic acquisition.

Exit: Byheart can complete a small campaign objective and retain at least one learned procedure.

## Phase 5 — deterministic game advisor

Build read-only mathematical helpers that reduce model burden.

Candidate calculations:

- market margin;
- cargo/fuel/supply feasibility;
- travel cost and deadline slack;
- route overlap among missions/opportunities;
- acquisition detour cost;
- sensor/interception geometry;
- fleet-strength estimates;
- expected replacement/refit cost;
- strategic-option tags for rare blueprints/hulls/weapons.

Feed the planner a ranked frontier instead of raw tables.

Exit: the model spends most calls on strategic ambiguity, not arithmetic or clerical UI work.

## Phase 6 — checkpoint search and policy distillation

- fork several plans from one checkpoint;
- score hard outcomes;
- let a strong model judge strategic residue;
- retain traces and causal differences;
- promote recurring successful decisions into heuristics;
- promote routine heuristics into deterministic evaluators;
- keep provenance from rule back to runs.

Exit: repeated play measurably reduces strong-model intervention per accepted objective.

## Phase 7 — Battle Brothers

Build a second game adapter to test transfer of the Byheart model.

- turn-state observation;
- tactical action catalog;
- UI execution capabilities;
- recruit/equipment/contract evaluators;
- checkpointed battle comparison;
- tactical policy compilation.

Exit: demonstrate that Byheart's core concepts survive a different game with different time and decision semantics.

## Phase 8 — learned capability ecosystem

Longer-term possibilities:

- capability catalog exposed as agent tools;
- capability dependency graph;
- automatic specialization by app/game version;
- cross-machine capability portability;
- model routing based on uncertainty and consequence;
- skill arbitration when several capabilities apply;
- capability retirement when evidence degrades;
- human interventions compiled into candidate repairs;
- transfer learning between related applications;
- experiment ledger showing which behavior became deterministic and why.

## A useful success metric

For a repeated family of tasks, track:

```text
strong-model calls per accepted result
human interventions per accepted result
replay success rate
cost / latency
capability reuse count
unknown-state rate
```

Byheart gets better when useful work migrates toward cheaper, more predictable execution while unusual situations remain visible.
