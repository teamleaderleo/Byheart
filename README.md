# Byheart

**Teach a computer a task once; let it remember how.**

Byheart turns successful computer-use experience into reusable capabilities.

A capable agent can explore an unfamiliar interface, accomplish a goal, and leave behind something more durable than a transcript: a typed, reviewable skill with inputs, outputs, checkpoints, evidence, policy, and a deterministic execution path.

```text
agent encounters task
  ↓
observe → decide → act
  ↓
successful run
  ↓
compile the useful behavior
  ↓
reusable capability
  ↓
replay / invoke / compose
```

The longer question is:

> How much of an agent's successful experience can become executable knowledge?

## The main split

Byheart does **not** need to own the reasoning model.

The preferred path is:

```text
Codex / another capable agent
        ↓ judgment
resident Byheart discovery session
        ↓ validated action
real surface
        ↓ receipt + observation + evidence
agent
        ↓
      ...
        ↓ success
Byheart capability compiler
        ↓
deterministic replay
```

Codex is especially useful because it can inspect source, logs, screenshots, adapters, and target behavior while teaching Byheart. The direct provider-API driver remains an optional portability adapter.

## Current status

The repository now contains:

- typed `byheart-capability/v1` and result contracts;
- input validation, parameter templating, and typed output extraction;
- deterministic replay without a model in the decision loop;
- explicit known outcomes versus execution failures;
- preconditions, postconditions, retries, recoveries, and human-on-failure routing;
- adapter/action/entrypoint/navigation allowlists and consequential-action policy;
- redacted JSONL evidence and screenshots;
- explicit live-session ownership states;
- real same-session human takeover and resume;
- a resident discovery session shared by embedded and external agents;
- a local external-discovery bridge designed for Codex/computer-use agents;
- successful-trace → parameterized capability compilation;
- versioned capability catalog and planner-facing tool descriptions;
- deterministic `byheart-plan/v1` capability composition;
- checkpointed candidate comparison with Pareto-frontier reporting;
- Playwright browser adapter with cross-frame semantic targeting;
- remote-desktop surface contract and HTTP transport;
- Preflight/Starsector semantic surface adapter over its closed request/receipt protocol;
- hybrid visual + semantic surfaces for game/native automation;
- an optional direct OpenAI Responses discovery model;
- a deliberately awkward local legacy-style browser target.

## Setup

Requirements: Node 22+.

```bash
npm install
npm run browser:install
npm test
```

No API key is required for the normal Codex-driven path.

## Demo target

Terminal 1:

```bash
npm run demo:target
```

The Perihelion Exchange Console runs at `http://127.0.0.1:4173`. It is table-heavy, iframe-based, and intentionally lacks test IDs. It exposes search → detail → form → review → confirmation plus injectable slowness, session expiry, surprise dialogs, validation errors, and a consequential purchase boundary.

## Teach with Codex

Terminal 2:

```bash
npm run build
npm run byheart -- teach \
  --url http://127.0.0.1:4173 \
  --goal "Find market ASH-17 and stage an order for 25 supplies. Stop at ORDER STAGED; do not submit a purchase." \
  --success-text "ORDER STAGED" \
  --parameter market=ASH-17 \
  --parameter quantity=25 \
  --known-outcome "market_not_found=NO SUCH MARKET" \
  --extract-output 'reference=string:Order reference' \
  --extract-output 'market=string:Order market' \
  --extract-output 'quantity=number:Order quantity' \
  --extract-output 'total_credits=number:Order total credits' \
  --name stage-supplies-order \
  --output evidence/discovery/capability.json \
  --run-dir evidence/discovery \
  --headed
```

`teach` opens one resident target session and prints a local bridge URL. Give Codex [`CODEX.md`](CODEX.md). Codex reads `/v1/state`, chooses one bounded action at a time, posts it through Byheart, inspects the receipt/new observation, and finishes through `/v1/done` once Byheart independently verifies the declared success condition.

The resulting artifact contains the successful external action trace, parameterized values, typed outputs, provenance, policy, retries/recovery seams, and evidence references. The demo exposes the staged reference, market, accepted quantity, and total credits through accessible status targets so replay can return them as typed outputs.

## Deterministic replay

```bash
npm run byheart -- replay \
  --capability evidence/discovery/capability.json \
  --input market=VES-04 \
  --input quantity=10 \
  --run-dir evidence/replay-from-discovery \
  --headed
```

Replay asks no model what to do next.

A checked-in example can be run immediately:

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-supplies-order.json \
  --input market=ASH-17 \
  --input quantity=25
```

A successful ASH-17 / 25-supplies replay returns outputs equivalent to:

```json
{
  "reference": "STG-001",
  "market": "ASH-17",
  "quantity": 25,
  "total_credits": 3600
}
```

Try a legitimate domain outcome:

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-supplies-order.json \
  --input market=DOES-NOT-EXIST \
  --input quantity=25
```

The result is `known_outcome: market_not_found`, instead of an execution crash.

## Same-session human takeover

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-and-submit-order.json \
  --input market=ASH-17 \
  --input quantity=25 \
  --run-dir evidence/handoff \
  --operator \
  --headed
```

Byheart drives the safe steps to the review screen. The final consequential click pauses automation and opens a tiny operator surface. Use the same live target browser to perform the requested step, then choose **Resume automation**. Replay verifies the postcondition and continues on that same session.

## Submission evidence

The captured submission is indexed in [`evidence/README.md`](evidence/README.md): one genuine Codex discovery, two successful replays of its compiled capability, five deterministic result cases, and a completed manual same-session takeover.

The deterministic evidence bundle can be regenerated in one command:

```bash
npm run evidence:replays
```

It captures success, typed outputs, a known business outcome, session-expiry recovery, a deliberately broken target, and the consequential-action boundary under `evidence/generated/`.

The genuine model-driven discovery and manual same-session takeover are intentionally separate runs because they are the parts whose provenance matters. Follow [`evidence/README.md`](evidence/README.md) for the exact submission runbook and expected evidence layout.

## Learned skills and checkpoint search

Capabilities can now become a planner vocabulary instead of isolated macros.

`CapabilityCatalog` keeps versioned skills. `byheart-plan/v1` composes them deterministically on one live surface, with earlier outputs available to later steps through `steps.<id>.outputs.*` templates.

A separate checkpoint runner compares several already-proposed candidates from the exact same baseline:

```text
restore checkpoint
  ↓
execute candidate A
  ↓
score

restore checkpoint
  ↓
execute candidate B
  ↓
score

restore checkpoint
  ↓
execute candidate C
  ↓
score

Pareto frontier + declared weighted utility
```

This is aimed at Starsector/Battle Brothers experiments where Codex proposes meaningful plans and Byheart handles repeatable execution/comparison. See [`research/SKILLS_AND_SEARCH.md`](research/SKILLS_AND_SEARCH.md).

## Optional direct API discovery

A standalone provider-backed path still exists when it is useful:

```bash
npm run byheart -- teach-api \
  --url http://127.0.0.1:4173 \
  --goal "..." \
  --success-text "ORDER STAGED" \
  --parameter market=ASH-17 \
  --parameter quantity=25 \
  --model <model>
```

That adapter can use `OPENAI_API_KEY`; it is not required by Byheart itself.

## Result classes

Replay reports one of four top-level outcomes:

```text
success
known_outcome
failure
intervention_required
```

An action receipt also keeps **delivery** separate from **verified effect**. A click reaching the input channel does not prove the application did what was intended.

## Surfaces beyond the browser

### Remote desktop

The remote adapter defines a small session/frame/input protocol for x86 Linux, Windows VMs, Moonlight, awkward native applications, and other pixel-first targets. The reasoning agent still sees screenshots; Byheart binds actions to one remote session identity and records frame evidence.

### Starsector through Preflight

Preflight already publishes exact PID/start-bound semantic state and accepts a closed catalog of reviewed game actions. Byheart now has an adapter for that boundary. This is the beginning of a split where Preflight owns exact game/process/save mechanics while Byheart owns planning, learned procedures, checkpoint search, and capability composition.

Interesting campaign work includes pause/resume movement, patrol evasion, market interaction, trading/smuggling, route planning, strategic acquisitions, and repeated checkpoint experiments. Fine combat control can remain secondary while the game autopilot handles ordinary fights.

### Battle Brothers

Turn-based combat and long-horizon company management give clean decision boundaries for model judgment, deterministic helpers, checkpoint search, and tactical policy compilation.

## Read next

- [`evidence/README.md`](evidence/README.md) — exact submission evidence runbook.
- [`CODEX.md`](CODEX.md) — primary discovery workflow for Codex/external agents.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — current technical model.
- [`ROADMAP.md`](ROADMAP.md) — ambitious implementation/research path.
- [`research/SKILLS_AND_SEARCH.md`](research/SKILLS_AND_SEARCH.md) — capability composition and checkpoint search.
- [`research/GAMEPLAY.md`](research/GAMEPLAY.md) — game-learning direction.
- [`TAKEHOME.md`](TAKEHOME.md) — the interview-project slice.
- [`REPORT.md`](REPORT.md) — design report under the assignment's seven exact headings.
- [`NOTES.md`](NOTES.md) — the larger idea pile.
- [`demo/legacy-console/`](demo/legacy-console/) — current browser target.
