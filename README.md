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

The dependency-light core is running and tested. It currently contains:

- typed capability and result contracts;
- input validation and parameter templating;
- deterministic replay;
- explicit known outcomes versus execution failures;
- preconditions, postconditions, retries, and recovery hooks;
- adapter/action/entrypoint allowlists;
- human approval routing for consequential actions;
- redacted structured evidence;
- explicit live-session ownership states;
- model-facing discovery loop;
- successful-trace → capability compiler;
- scripted adapter for deterministic tests;
- a deliberately awkward local legacy-style browser target for the next milestone.

Run the core:

```bash
npm install
npm test
npm run demo
```

Run the local UI target:

```bash
npm run demo:target
```

Then open `http://127.0.0.1:4173`.

## Near-term milestone

The next milestone is the complete computer-use take-home vertical slice:

```text
natural-language goal
  ↓
real LLM discovery against the local UI
  ↓
saved byheart-capability/v1 artifact
  ↓
deterministic Playwright replay
  ↓
success / known outcome / failure / human takeover
  ↓
evidence
```

The local target already exposes a search → detail → form → review → confirmation flow plus injected slowness, session expiry, surprise dialog, validation errors, and a consequential purchase boundary.

## Beyond the take-home

Byheart is intentionally broader than browsers. A surface may be:

- web page;
- native desktop app;
- accessibility tree;
- screenshot + coordinates;
- remote desktop;
- Linux/Windows VM;
- Moonlight session;
- game;
- semantic adapter embedded in the target;
- hybrid of several observation/action channels.

The personally interesting research path is games where a strong model can supply useful priors immediately and repeated successful behavior can migrate into cheaper skills.

### Starsector

Preflight already contains the beginnings of a semantic game-control layer. Byheart can eventually sit above it for campaign planning, UI operation, pause/resume movement, evasion, trading/smuggling, checkpointed plan comparison, and compilation of repeated procedures.

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
