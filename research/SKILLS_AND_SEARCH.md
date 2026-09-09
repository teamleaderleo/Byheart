# Learned skills and checkpoint search

Byheart gets more interesting once a successful procedure becomes part of the agent's action vocabulary.

The progression is:

```text
raw UI actions
  ↓
learned capability
  ↓
capability catalog
  ↓
composed plan
  ↓
checkpoint comparison
  ↓
retained better policy
```

## Capability catalog

`CapabilityCatalog` is a versioned vocabulary of executable skills.

A planner can ask for the latest reviewed version of `trade.black-market`, explicitly pin `trade.black-market@2`, list available skills, or expose the latest versions as planner-facing tool descriptors.

The important distinction is that the catalog contains executable contracts, not prose memories.

A future Starsector vocabulary might include:

```text
campaign.set_destination
campaign.evade_fleet
campaign.approach_market_covertly
market.open_trade
market.buy_commodity
market.sell_commodity
fleet.refuel_to_reserve
fleet.restock_supplies
intel.accept_bounty
refit.install_hullmod
```

Codex can reason over those names instead of repeatedly deciding every click.

## Deterministic plans

`byheart-plan/v1` composes capabilities while keeping replay deterministic.

Example:

```yaml
format: byheart-plan/v1
id: trip.smuggling-run
version: 1

inputs:
  market: { type: string }
  commodity: { type: string }
  quantity: { type: number }

steps:
  - id: prepare
    capability: { id: fleet.prepare-trip }
    inputs:
      fuelReserve: 300

  - id: approach
    capability: { id: campaign.approach-market-covertly }
    inputs:
      market: "{{input.market}}"
      currentFuel: "{{steps.prepare.outputs.fuel}}"

  - id: trade
    capability: { id: market.buy-black-market }
    inputs:
      commodity: "{{input.commodity}}"
      quantity: "{{input.quantity}}"
```

Outputs from an earlier skill live under `steps.<step>.outputs.*`, so later skills can consume them.

A plan preserves each child capability result. A known outcome, hard failure, or human intervention stops the plan with the exact child result attached.

The planner can therefore operate at two levels:

```text
novel situation -> reason and teach a new skill
known situation -> compose existing skills
```

## Checkpoint search

Games make repeated trials cheap when the baseline can be restored exactly.

`CheckpointSearchRunner` intentionally separates candidate generation from evaluation:

```text
Codex / heuristic / search policy proposes candidates
                 ↓
           candidate A B C
                 ↓
Byheart restores the same checkpoint before each
                 ↓
execute candidate
                 ↓
score hard metrics
                 ↓
Pareto frontier + weighted ranking
```

Candidate generation can stay intelligent and creative. Evaluation stays repeatable.

For a Starsector smuggling problem, candidates might be:

```text
A: direct route, transponder off near destination
B: long route through asteroid terrain, go dark for final approach
C: pay the inspection risk and remain at maximum burn
```

Metrics can include:

- credits gained;
- campaign days elapsed;
- fuel consumed;
- supplies consumed;
- reputation change;
- hull/ship losses;
- patrol interceptions;
- strategic acquisitions;
- end-state fleet value.

A Pareto frontier is useful because one route may make more money while another is safer or quicker. Weighted utility can select a winner when the caller has already declared the relative price of those quantities.

## Strong-model residue

Some value remains difficult to express as a clean metric:

- a rare blueprint opens an important future fleet family;
- a hull is unusually useful for the current roster;
- a detour positions the fleet near several future objectives;
- reputation with one faction is strategically more valuable than its numeric delta suggests.

Keep deterministic quantities exact. Let the planner add a bounded strategic score or choose among the small frontier when genuine judgment remains.

That creates a useful computational split:

```text
large candidate set
  ↓ deterministic feasibility / economics
small Pareto frontier
  ↓ strong-model strategic judgment
chosen plan
  ↓ deterministic capability execution
```

## Policy distillation

Repeated checkpoint results can eventually produce candidate rules.

Example:

```text
observed across many accepted runs:
  going dark near patrol-heavy hostile markets
  succeeds when sensor terrain is within 12 seconds
  and burn disadvantage is <= 2
```

A later distillation layer can propose:

```yaml
rule: covert-approach-near-sensor-terrain
when:
  hostilePatrolsNearby: true
  sensorTerrainEtaSeconds: { max: 12 }
  burnDisadvantage: { max: 2 }
action:
  capability: campaign.approach-market-covertly
```

That rule should retain links to the runs that support and contradict it. Promotion into deterministic policy deserves its own evidence threshold.

## Relation to reinforcement learning

This is the shortcut discussed in the project notes.

A capable model supplies useful concepts immediately. Byheart turns successful interaction into meaningful actions. Search or RL can then operate over:

```text
evade patrol
approach covertly
trade at market
refit fleet
accept mission
```

instead of:

```text
move mouse 17 pixels
click
wait
press W
```

The remaining learning problem becomes much closer to the decisions a human player actually cares about.
