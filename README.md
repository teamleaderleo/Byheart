# Byheart

**Teach a computer a task once; let it remember how.**

Byheart turns successful computer-use experience into reusable capabilities.

A capable model can explore an unfamiliar interface, accomplish a goal, and leave behind something more durable than a transcript: a typed, reviewable skill with inputs, outputs, checkpoints, evidence, policy, and a deterministic execution path.

```text
goal
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

## Current status

The browser vertical slice now includes:

- typed `byheart-capability/v1` and result contracts;
- input validation and parameter templating;
- deterministic replay without a model in the decision loop;
- explicit known outcomes versus execution failures;
- preconditions, postconditions, retries, recoveries, and human-on-failure routing;
- adapter/action/entrypoint allowlists and consequential-action policy;
- redacted JSONL evidence and screenshots;
- explicit live-session ownership states;
- real same-session human takeover and resume;
- model-facing observe → decide → act discovery;
- successful-trace → parameterized capability compiler;
- Playwright browser adapter with cross-frame semantic targeting;
- OpenAI Responses discovery model;
- a deliberately awkward local legacy-style browser target.

## Setup

Requirements: Node 22+ and an OpenAI API key only for live discovery.

```bash
npm install
npm run browser:install
npm test
```

Keep credentials in the environment. See `.env.example`.

## Demo target

Terminal 1:

```bash
npm run demo:target
```

The Perihelion Exchange Console runs at `http://127.0.0.1:4173`. It is table-heavy, iframe-based, and intentionally lacks test IDs. It exposes search → detail → form → review → confirmation plus injectable slowness, session expiry, surprise dialogs, validation errors, and a consequential purchase boundary.

### Deterministic replay

Terminal 2:

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-supplies-order.json \
  --input market=ASH-17 \
  --input quantity=25 \
  --headed
```

Try a legitimate domain outcome:

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-supplies-order.json \
  --input market=DOES-NOT-EXIST \
  --input quantity=25
```

The result is `known_outcome: market_not_found`, rather than an execution crash.

### Same-session human takeover

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-and-submit-order.json \
  --input market=ASH-17 \
  --input quantity=25 \
  --operator \
  --headed
```

Byheart drives the safe steps to the review screen. The final consequential click pauses automation and opens a tiny operator surface. Use the same live target browser to perform the requested step, then choose **Resume automation** in the operator surface. Replay verifies the postcondition and continues on that same session.

### Real model discovery

With `OPENAI_API_KEY` set:

```bash
npm run byheart -- teach \
  --url http://127.0.0.1:4173 \
  --goal "Look up market ASH-17, stage a purchase order for 25 supplies, and stop when ORDER STAGED is visible." \
  --success-text "ORDER STAGED" \
  --parameter market=ASH-17 \
  --parameter quantity=25 \
  --known-outcome "market_not_found=NO SUCH MARKET" \
  --name stage-supply-order \
  --output runtime/stage-supply-order.json \
  --headed
```

Discovery stores screenshots, a structured decision/action log, and the external trace under `runtime/`, then emits a parameterized capability. Replay it without another model decision loop:

```bash
npm run byheart -- replay \
  --capability runtime/stage-supply-order.json \
  --input market=VES-04 \
  --input quantity=10 \
  --headed
```

## Result classes

Replay reports one of four top-level outcomes:

```text
success
known_outcome
failure
intervention_required
```

An action receipt also keeps **delivery** separate from **verified effect**. A click reaching the input channel does not prove the application did what was intended.

## Beyond the take-home

Byheart is intentionally broader than browsers. A surface may be a native desktop app, accessibility tree, screenshot/coordinate stream, remote desktop, Linux/Windows VM, Moonlight session, game, embedded semantic adapter, or a hybrid of several channels.

The personally interesting research path is games where a strong model can supply useful priors immediately and repeated successful behavior can migrate into cheaper skills.

### Starsector

Preflight already contains the beginnings of a semantic game-control layer. Byheart can sit above it for campaign planning, UI operation, pause/resume movement, evasion, trading/smuggling, checkpointed plan comparison, and compilation of repeated procedures.

### Battle Brothers

Turn-based combat and long-horizon company management give clean decision boundaries for model judgment, deterministic helpers, checkpoint search, and tactical policy compilation.

### Remote desktop

A screenshot + mouse/keyboard adapter is the universal lowest-common-denominator route into awkward native software and VMs. Stronger guest-side adapters can replace stable pieces later.

## Read next

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — current technical model.
- [`ROADMAP.md`](ROADMAP.md) — ambitious implementation/research path.
- [`TAKEHOME.md`](TAKEHOME.md) — the interview-project slice.
- [`REPORT.md`](REPORT.md) — live draft under the assignment's exact headings.
- [`NOTES.md`](NOTES.md) — the larger idea pile.
- [`demo/legacy-console/`](demo/legacy-console/) — current browser target.
