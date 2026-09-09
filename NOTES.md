# Byheart notes

This is the current idea pile. It is deliberately broader than the first implementation.

## Thesis

A strong model can often solve a task immediately because it already carries useful concepts, heuristics, and world knowledge. The expensive part is frequently the first encounter with a particular interface or situation.

Byheart tries to preserve the useful part of that experience.

```text
model encounters unfamiliar task
        ↓
reasons through it
        ↓
acts successfully
        ↓
extract reusable behavior
        ↓
future calls invoke a capability
        ↓
less reasoning, less latency, more predictability
```

The model discovers. Byheart remembers.

The memory can live at several levels:

- exact UI procedure;
- parameterized workflow;
- short-horizon control skill;
- decision heuristic;
- planner primitive;
- evidence about when a tactic works;
- a deterministic evaluator that replaces a judgment the model used to make repeatedly.

The interesting research question is how behavior moves downward through those levels as experience accumulates.

## A capability is more than a macro

A useful capability should carry a contract.

Possible fields:

```yaml
name: smuggle_into_market
version: 3

inputs:
  market: MarketRef
  cargo: CargoPlan

preconditions:
  - campaign_state
  - transponder_control_available
  - enough_fuel_for_route

actions:
  - ...

checkpoints:
  - market_interaction_open
  - trade_screen_open

outputs:
  credits_delta: int
  cargo_delta: CargoDelta
  reputation_delta: int

stop_conditions:
  - patrol_intercept_risk_high
  - dialog_unknown
  - fuel_below_reserve

evidence:
  learned_from_run: ...
  successful_replays: 18
```

The recorded action sequence is only one part. Preconditions, stop rules, state observations, result checks, and evidence make the behavior reusable.

## Compile more than clicks

There are at least three compilation targets.

### 1. UI execution

Example: opening a market, selecting the black market tab, buying cargo, and closing the screen.

This can often become deterministic quickly.

### 2. Short-horizon policy

Example: evade a pursuing patrol while continuing toward a destination.

The first attempts may involve repeated model observation and clicking. Later this may become a small policy with explicit state and termination conditions.

### 3. Decision policy

Example: buy a rare blueprint when its expected future value exceeds the cost and detour under current campaign constraints.

Some recurring judgments can eventually become a deterministic evaluator or a cheaper model call.

The progression could be:

```text
large model reasons from scratch
        ↓
large model invokes learned procedure
        ↓
small model chooses among learned skills
        ↓
deterministic evaluator chooses routine cases
        ↓
large model sees only genuine ambiguity
```

## Intelligence at different timescales

A single model does not need to own every instant of execution.

A useful hierarchy:

- **planner:** long-horizon goals and tradeoffs;
- **tactical model:** short-horizon choices when conditions change;
- **capability executor:** known multi-step behavior;
- **reflex controller:** tiny deterministic reactions and time-bounded actions.

For continuous environments, time itself can be an action:

```text
pause
resume 250ms
resume 1s
resume until condition
normal speed
double speed
```

This is especially important in Starsector. Campaign play can often proceed as:

```text
pause
  ↓
observe
  ↓
choose maneuver / goal
  ↓
resume briefly
  ↓
pause on event or timer
  ↓
reassess
```

The game already provides a natural way to trade latency for deliberation.

## Strong models as a shortcut around primitive RL

Starting reinforcement learning from raw mouse coordinates and keypresses wastes enormous effort discovering concepts a capable model already understands.

A strong model begins with useful priors such as:

- money and opportunity cost;
- danger and survival;
- pursuit and evasion;
- resource scarcity;
- future investment;
- route planning;
- concealment;
- inventory value;
- tactical advantage;
- preserving optionality.

So the initial policy can already behave coherently.

Repeated experiments then improve uncertain decisions instead of rediscovering basic human concepts.

Later, RL or search can operate over a much better action space:

```text
raw action space:
click x,y
keypress
mouse drag
wait

learned action space:
evade fleet
approach market covertly
buy supplies
refit fleet
pursue bounty
acquire blueprint
```

This turns a hopelessly sparse interaction problem into hierarchical optimization over meaningful actions.

## Checkpoints and repeated lives

Checkpointed environments make experimentation unusually powerful.

```text
checkpoint
  ↓
try plan A
  ↓
score and retain trace

checkpoint
  ↓
try plan B
  ↓
score and retain trace

checkpoint
  ↓
modify the best plan
```

The score can combine hard metrics and higher-level judgments.

Examples:

- credits;
- fleet value;
- survival;
- injuries/losses;
- fuel and supplies consumed;
- campaign days elapsed;
- reputation;
- blueprints/hullmods/weapons acquired;
- mission progress;
- colony progress;
- future option value.

A model can help judge strategic value while deterministic code handles quantities that have clean formulas.

## Starsector

Starsector looks like an unusually rich Byheart playground.

### Campaign play is the main attraction

The difficult part is a stream of constrained decisions:

- where to travel;
- how much fuel/supplies to carry;
- what to buy and sell;
- whether to smuggle;
- transponder state;
- sustained burn versus stealth;
- when to go dark;
- how to avoid patrols;
- whether to fight or escape;
- which missions can share a route;
- what equipment deserves a detour;
- whether a blueprint is worth a large present cost for future power;
- when to refit;
- when to preserve cash;
- which region offers the best cluster of opportunities.

This is a planner problem wrapped in a large amount of UI interaction.

Byheart can remove the clerical part as capabilities accumulate.

### Campaign movement

Movement still involves real clicks and visual state.

A useful loop might be:

```text
pause
inspect player + nearby fleets + terrain + destination
choose temporary waypoint / ability / speed mode
click
resume for a bounded interval
pause when interception geometry changes
```

Eventually `evade_fleet` could become a reusable skill with parameters and stop conditions.

Example:

```yaml
skill: evade_fleet
inputs:
  threat: FleetRef
  destination: WorldPoint
constraints:
  minimum_fuel_reserve: 300
  avoid_hostile_market_radius: true
options:
  - temporary_waypoint
  - normal_burn
  - sustained_burn
  - go_dark
stop_when:
  - intercept_margin_safe
  - safe_route_impossible
  - new_hostile_detected
  - destination_reached
```

### Trading and smuggling

A read-only advisor mod could provide compact semantic data while Byheart still operates the actual game/UI.

Possible state:

```json
{
  "credits": 183420,
  "cargo_free": 312,
  "fuel": 840,
  "supplies": 177,
  "burn": 9,
  "sensor_profile": 1320,
  "location": "Corvus",
  "known_prices": [],
  "missions": [],
  "known_blueprints": [],
  "nearby_fleets": []
}
```

A deterministic advisor could compute candidate opportunities:

- expected trade margin;
- fuel and supply cost;
- distance;
- deadline slack;
- route overlap;
- cargo capacity;
- known patrol risk;
- acquisition difficulty;
- immediate cash return.

The model then handles strategic value and ambiguity.

A rare blueprint may have negative immediate profit and enormous future usefulness. A mediocre trade route may become excellent because it shares a path with a bounty and a desired hull acquisition.

### Combat

Combat can initially use the game's existing autopilot where that produces acceptable outcomes. The planner decides whether the fight should happen, fleet preparation, deployment, retreat, and broad combat intent.

Fine-grained combat control can come later if it proves interesting.

Preflight already contains the beginning of a semantic game-control protocol, including exact process identity, request/receipt actions, campaign state, simulation/combat actions, and checkpoint-oriented thinking. That makes Preflight a natural lower layer for a Starsector adapter.

Relevant existing Preflight notes:

- https://github.com/teamleaderleo/preflight/blob/main/docs/internal-game-control.md
- https://github.com/teamleaderleo/preflight/blob/main/docs/evidence/2026-08-26-internal-action-automation.md

## Battle Brothers

Battle Brothers offers a different research environment.

Combat is turn-based, which gives the model a clean deliberation point for each action.

A semantic combat observation could include:

```text
active brother
AP / fatigue / HP / armor
weapon and skills
adjacent allies/enemies
reachable tiles
terrain/elevation
morale
available actions
```

The model can choose a meaningful action while Byheart performs and verifies the UI interaction.

Campaign planning brings another long-horizon optimization problem:

- contracts;
- recruitment;
- wages;
- food;
- medicine;
- tools;
- equipment;
- injuries;
- morale;
- settlements;
- travel;
- company composition;
- perk builds;
- named gear;
- risk of particular enemy types.

Repeated battles from one checkpoint provide an easy way to compare tactical lines and retain useful policies.

Battle Brothers may be especially good for testing whether model judgment can gradually become reusable tactical rules.

## Remote desktop as a universal surface

A remote-desktop stream gives Byheart a generic lowest-common-denominator adapter:

```text
screenshot
  ↓
mouse / keyboard
  ↓
next screenshot
```

That makes many targets available immediately:

- x86 Linux VM;
- Windows VM;
- Moonlight session;
- native applications;
- games;
- launchers;
- installers;
- admin tools;
- old desktop software.

The strongest implementation can mix layers.

Example:

```text
remote desktop for unfamiliar interaction
        ↓
learn the workflow
        ↓
replace stable portions with semantic guest-side actions
        ↓
retain visual control for the remaining unknown pieces
```

A VM also gives us snapshots, clean resets, and isolated experimentation.

A useful reproducibility bundle could include:

```text
VM snapshot identity
game/application version
save/checkpoint identity
Byheart capability version
model/provider identity
input parameters
action trace
screenshots / receipts
result
```

## Surface adapters

Byheart should eventually see surfaces through a common interface.

Conceptually:

```text
Surface
  observe() -> Observation
  act(Action) -> ActionReceipt
  captureEvidence() -> Evidence
  handoff() -> LiveSessionHandle
```

Possible implementations:

- Playwright/browser;
- accessibility tree;
- screenshot + coordinates;
- OS input automation;
- remote desktop;
- guest helper;
- game semantic control;
- hybrid adapters combining several observation/action channels.

The capability artifact should describe intent and target semantics at a level above any one adapter where practical.

## Observation quality

Execution becomes much easier as the observation channel improves.

Possible hierarchy:

```text
pixels only
pixels + OCR/accessibility
pixels + DOM/accessibility tree
pixels + semantic guest state
pixels + domain-specific advisor
```

The screen remains valuable even when semantic data exists. It catches unexpected dialogs, visual changes, failures in the semantic adapter, and states the helper forgot to model.

## Receipts and evidence

Every action should produce evidence that distinguishes delivery from effect.

```text
requested click
  != click event sent
  != UI changed
  != task checkpoint reached
```

Useful receipts include:

- action requested;
- surface identity;
- observed pre-state;
- execution mechanism;
- observed post-state;
- checkpoint status;
- screenshot/trace pointer;
- elapsed time;
- failure classification.

This is useful both for the interview project and for long-running game experiments.

## Failures are learning material

A failed action can teach:

- the locator was weak;
- the action reached the wrong window;
- a game invariant was violated;
- a dialog changes pause semantics;
- a coordinate mapping changed;
- a capability has an undeclared precondition;
- an apparently deterministic procedure actually contains a decision boundary.

Retaining these failures can improve the capability contract and prevent repeated dead ends.

## Human takeover

A live run should be able to pause and give control to a person without creating a fresh session.

Possible states:

```text
agent_owned
paused_for_review
human_owned
returning_to_agent
completed
failed
```

The human action trace becomes part of the evidence. Later we can ask whether the intervention itself should become a learned capability.

This creates an appealing loop:

```text
automation reaches unknown state
human fixes it
run continues
system records the seam
future discovery tries to absorb that seam
```

## Model routing

Different decisions deserve different model budgets.

Possible routing:

- deterministic executor for routine known flows;
- tiny/low-latency model for local choices;
- medium model for tactical replanning;
- strong model for unfamiliar states, strategic planning, capability creation, and repeated failures.

Escalation signals could include:

- confidence below threshold;
- unknown UI state;
- repeated replay failure;
- conflicting objectives;
- high consequence;
- novel observation;
- policy disagreement;
- surprising result.

The ideal mature run might spend almost all of its time in deterministic or cheap execution and call a strong model only when something genuinely interesting happens.

## Capability composition

Eventually higher-level behaviors can be built from lower-level ones.

```text
run_profitable_smuggling_trip
  ├─ evaluate_opportunities
  ├─ prepare_cargo
  ├─ travel_to_system
  │    ├─ set_destination
  │    └─ evade_interception
  ├─ approach_market_covertly
  ├─ trade_black_market
  └─ replan
```

Capabilities can themselves become tools exposed to an agent planner.

The catalog becomes the agent's learned vocabulary.

## Questions worth testing

1. How much of a successful model-driven run can be compiled automatically?
2. Which decisions remain stable enough to become deterministic policies?
3. How should capability validity be tied to application/game versions and observed state?
4. How should a locator or target survive different resolutions, tenants, themes, and platforms?
5. What evidence proves replay success without asking a model?
6. When should a replay failure invoke a model, invoke a human, or stop?
7. Can human interventions become future training examples or capabilities?
8. How cheaply can a strong model teach a smaller model/action catalog?
9. How much strategic knowledge transfers across saves, mod sets, and game versions?
10. Can repeated checkpoint search outperform one-shot model play on meaningful campaign decisions?
11. Which game helpers should expose facts, and which should compute recommendations?
12. How much can a domain-specific mathematical advisor reduce model calls while improving play?
13. Can learned skills form a useful hierarchy without becoming a pile of brittle macros?
14. How should competing capabilities be selected when several are applicable?
15. Can a capability carry enough provenance to explain where it came from and why it is trusted?

## Near-term implementation instincts

A first Byheart should stay small:

- one surface adapter;
- one genuine LLM-driven discovery loop;
- one capability format;
- one deterministic replay engine;
- explicit business/expected outcomes versus execution failures;
- screenshots/logs/receipts;
- one human takeover path;
- one demo task with parameters;
- one replay failure case;
- clean seams for future adapters.

The interview project can supply this first vertical slice.

After that, the most personally interesting next experiments are probably:

1. remote-desktop adapter against the existing VM setup;
2. Preflight/Starsector adapter using existing game-control work;
3. a checkpointed Starsector campaign experiment;
4. capability composition and model routing;
5. a Battle Brothers prototype if the Starsector work teaches enough reusable lessons.

## Possible product sentence

> Byheart turns successful computer-use experience into executable skills.

Another:

> Show it once. Keep the skill.

And the original:

> Teach the computer something once; afterward, it knows it by heart.
