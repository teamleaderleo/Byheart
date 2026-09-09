# Gameplay research direction

Byheart's game work is less interesting as “teach a model to press every key” and more interesting as **turn successful play into reusable competence**.

A strong model starts with a useful semantic prior: money, danger, pursuit, opportunity cost, concealment, retreat, route planning, investment, scarcity, and long-horizon goals already mean something. The system can spend experiments on the uncertain parts instead of discovering from scratch that survival and resources are useful.

```text
strong model prior
    ↓
play a real situation
    ↓
retain decisions + execution + outcome
    ↓
compile repeated procedures / heuristics
    ↓
move routine work to cheaper control
```

The reinforcement loop still exists. The action space becomes much better.

## The control ladder

Different clocks deserve different controllers.

```text
strategic model        minutes / long-horizon decisions
planner                seconds / one situation
learned capability      repeated multi-step procedure
semantic controller     bounded game action
reflex/autoplay         frequent low-level behavior
```

Promote behavior downward when repeated evidence makes it boring.

Examples:

- the large model decides that a blueprint detour is worth the opportunity cost;
- a smaller planner selects a smuggling route;
- `approach_market_dark(...)` handles the familiar approach;
- Preflight supplies exact pause/resume/interaction actions;
- Starsector's own autopilot handles routine combat when tactical piloting adds little value.

## Starsector

Starsector's campaign layer is a particularly good fit because time can pause.

A seemingly split-second problem becomes:

```text
pause
  ↓
observe player / fleets / terrain / route
  ↓
choose a short maneuver
  ↓
resume for a bounded interval or until an event
  ↓
pause and re-evaluate
```

This can support pursuit and evasion without requiring a model response every frame.

### Continuous campaign experiment

The default research run is now a **fresh, agent-owned, continuing campaign**, not a maintainer-authored benchmark sequence.

Codex should start its own game, choose its own new-game options and objectives, play forward on the same save, learn from tooltips/runtime evidence/external guides, and keep compact working memory under `play/starsector/`. It can improve tooling while playing when repeated friction reveals a useful helper, observation, semantic action, or Byheart capability.

Prepared scenarios and checkpoint copies remain valuable for debugging, regression proof, controller recovery, or deliberate comparison of alternatives. They should support ordinary play instead of replacing it.

The first useful horizon is roughly 30 in-game days, followed by later sessions that continue the same campaign. See [`../STARSSECTOR_PLAY.md`](../STARSSECTOR_PLAY.md).

### Campaign decisions worth spending intelligence on

- destination and route choice;
- fuel/supply/cargo feasibility;
- combining missions into one trip;
- whether to run transponder, go dark, use sustained burn, or take a longer approach;
- market selection and smuggling risk;
- buy/sell/keep decisions;
- immediate profit versus rare strategic acquisitions;
- fleet upgrades, refits, blueprints, hullmods, weapons, and colony investment;
- evade, intercept, fight, disengage, or abandon an objective;
- when a nearby opportunity justifies replanning.

### Deterministic advisor

A read-only mod/helper can calculate the parts that deserve arithmetic instead of model tokens:

```text
reachable markets
known prices
cargo capacity
fuel/supply budget
travel time
mission deadlines
route overlap
sensor geometry
fleet-strength estimates
acquisition detour cost
```

The planner receives a candidate frontier and handles the ambiguous residue.

A rare blueprint can have negative immediate return and enormous strategic value. A high-margin trade can still be a poor use of campaign time. Those are exactly the decisions where a model can add value above deterministic ranking.

### Checkpoint search

Preflight already treats experimental agent play as a safe checkpoint-copy problem. Byheart can exploit that when a decision is genuinely worth comparing:

```text
copy current campaign checkpoint
→ try route A
→ score

restore checkpoint copy
→ try route B
→ score

choose the continuing branch explicitly
```

Retain hard outcomes and a model judgment for strategic residue. Repeated winners become candidate policy rules or capabilities. Ordinary campaign play should continue forward without routine rollback.

### First Starsector milestones

1. start a fresh campaign and record exact save/game/profile identity;
2. play the opening normally through the real UI, using Preflight controls where already reviewed;
3. keep the campaign alive for an initial ~30 in-game days;
4. retain a useful self-written playbook rather than a transcript;
5. teach/replay the first genuinely repeated UI procedure that emerges from play;
6. add the first deterministic helper or read-only observation that materially reduces repeated reasoning;
7. handle one meaningful pursuit/evasion or dangerous travel situation with pause/replan increments;
8. use a checkpoint copy to compare alternatives only when a real decision makes the comparison useful;
9. execute increasingly open-ended economic/strategic objectives on the same campaign;
10. measure whether strong-model calls and UI rediscovery fall as skills accumulate while campaign quality stays acceptable.

## Battle Brothers

Battle Brothers gives a different clock. Combat is turn-based, so every brother action is already a natural model decision boundary.

Useful semantic observation:

```text
active brother
AP / fatigue / HP / armor
weapon and usable skills
nearby allies/enemies
terrain/elevation
morale/injuries
legal moves and attacks
```

The model chooses among meaningful actions. Byheart handles UI execution and verifies the result.

Campaign play adds contracts, wages, food, tools, medicine, recruiting, equipment, injuries, settlements, reputation, travel distance, enemy composition, named gear, perk builds, and reserve management.

Many of those decisions can migrate into deterministic helpers:

- recruit scoring;
- equipment comparison;
- supply purchasing;
- contract economics;
- perk prerequisites;
- encounter feasibility estimates.

Checkpointed fights allow direct tactical comparison without millions of random clicks.

## Learning without pretending everything is RL

Byheart can retain several kinds of learned object:

```text
fact       this enemy composition punishes my current frontline
heuristic  disengage above this risk threshold
skill      evade_patrol(...)
procedure  travel → dock → trade → refuel → depart
policy     choose among known skills under explicit conditions
```

Evidence stays attached. A heuristic can be retired when later runs contradict it.

A useful research metric is **strong-model calls per accepted objective**. If repeated play keeps the success rate while that number falls, executable experience is doing useful work.
