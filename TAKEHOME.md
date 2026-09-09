# Byheart as the computer-use take-home

The interview assignment funds the first real Byheart implementation.

Its required loop maps directly onto the project:

```text
natural-language goal
  ↓
LLM/agent-driven discovery against a real UI
  ↓
successful run
  ↓
typed reusable artifact
  ↓
deterministic replay
  ↓
success / known outcome / failure / human intervention
```

## Implemented vertical slice

The current submission path uses the local Perihelion Exchange Console as the awkward target. The page is real browser UI, iframe-heavy, table-heavy, and intentionally lacks test IDs.

Byheart implements:

- natural-language goal + target;
- real Playwright UI interaction;
- observe/decide/act discovery;
- Codex/external-agent resident discovery bridge;
- optional direct provider-API discovery adapter;
- typed, versioned `byheart-capability/v1` artifact;
- typed inputs and outputs;
- deterministic replay with no model decision loop;
- semantic browser target identification;
- known domain outcomes;
- bounded retries and runtime recovery;
- hard failures with evidence;
- adapter/action/origin/navigation allowlists;
- conservative consequence policy;
- redacted JSONL evidence and screenshots;
- same-session human takeover/resume;
- seven-heading design report.

The broader desktop, remote, game, and multi-tenant questions stay behind the same `Surface` and capability contracts.

## Why Codex drives discovery

Byheart does not need to embed the model provider.

The preferred teaching path is one resident Byheart session driven by Codex:

```text
Codex
  ↓ GET observation / screenshot
Byheart bridge
  ↓
Codex chooses one action
  ↓ POST action
Byheart policy + surface adapter
  ↓
real UI
  ↓
receipt + next observation
```

This still puts an LLM in the control loop during discovery: Codex observes the live state and chooses every discovery action. Byheart owns the execution boundary, policy, evidence, and trace.

The distinction is useful for the project after the interview too. Codex can inspect source, logs, and adapters while operating the UI; later ChatGPT computer use, local models, or other agent runtimes can drive the same bridge.

See [`CODEX.md`](CODEX.md) for the exact loop.

## Demo

Start the target:

```bash
npm install
npm run browser:install
npm run demo:target
```

Start a teach session:

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
  --run-dir evidence/discovery
```

The command prints a local discovery URL and keeps the same browser session resident. Codex drives `/v1/state` and `/v1/action`; `/v1/done` succeeds only when Byheart independently verifies `ORDER STAGED`.

Then replay with different parameters:

```bash
npm run byheart -- replay \
  --capability evidence/discovery/capability.json \
  --input market=VES-04 \
  --input quantity=10
```

A checked-in capability can be replayed immediately without a teach run:

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-supplies-order.json \
  --input market=ASH-17 \
  --input quantity=25
```

## Capability contract

A capability is understandable without any hidden model reasoning:

```yaml
format: byheart-capability/v1
id: perihelion.stage-supplies-order
version: 1

target:
  adapter: browser
  entrypoint: http://127.0.0.1:4173

inputs:
  market: { type: string }
  quantity: { type: string }

steps:
  - id: step-01
    action:
      kind: type
      target: { kind: label, label: Market code }
      text: "{{input.market}}"

  - id: step-02
    action:
      kind: click
      target: { kind: role, role: button, name: Search }

success:
  - kind: text_present
    text: ORDER STAGED

policy:
  allowedAdapters: [browser]
  allowedActions: [click, type, select, wait]
  allowedEntrypoints: [http://127.0.0.1:4173/*]
  consequentialPolicy: require_human
```

The real examples also carry retries, known outcomes, recovery rules, human escalation points, and provenance.

## Result contract

Replay returns one of four top-level outcomes:

```text
success
  outputs
  evidence

known_outcome
  code
  step
  evidence

failure
  class
  step
  expected / observed / detail
  evidence

intervention_required
  reason
  live session identity
  step
  evidence
```

`market_not_found` is a normal domain result. A missing control, changed surface, policy denial, or failed checkpoint is an execution failure.

## Stable identification

The browser adapter searches every frame and prefers semantic targets:

1. role + accessible name;
2. label/control relationship;
3. stable text;
4. selector only when semantics are unavailable;
5. point targets for pixel-first adapters.

A target must resolve uniquely before Byheart acts. The remote-desktop adapter deliberately starts lower in the stack with screenshots + points; the Preflight adapter starts higher with reviewed semantic game actions.

## Runtime errors and recovery

The target includes deliberate exceptional states:

- unknown market → `known_outcome`;
- slow UI → bounded wait/retry;
- expired session → normal UI recovery through `Re-authenticate`;
- surprise dialog → human-on-failure path;
- changed/missing target → hard failure with step/evidence;
- final purchase → consequential boundary.

This keeps expected business outcomes separate from transient recoverable states and hard execution failures.

## Human handoff

Ownership follows:

```text
automation_owned
      ↓
paused_for_review
      ↓
human_owned
      ↓
returning_to_automation
      ↓
automation_owned
```

The operator surface shows run/step/session/reason plus a current screenshot. The human acts in the same live browser session and explicitly returns control. Replay re-checks the step postcondition before proceeding.

Demo:

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-and-submit-order.json \
  --input market=ASH-17 \
  --input quantity=25 \
  --operator --headed
```

## Safety

Before each replay action, policy checks:

- adapter allowlist;
- current entrypoint/origin;
- action kind;
- navigation destination;
- consequence classification.

Consequential work can be blocked, explicitly allowed, or routed to a human. Evidence passes through a central redaction sink before persistence.

The browser demo never requires real credentials, real money, or an external service.

## Evidence

The completed submission is indexed in [`evidence/README.md`](evidence/README.md):

- `discovery/`: genuine Codex bridge trace, compiled capability, durability candidate/memo, redacted log, screenshots;
- `replay-from-discovery/` and `replay-from-discovery-ash17/`: two successful invocations of that compiled capability;
- `generated/`: success, known outcome, session recovery, hard failure, and consequence-boundary cases;
- `handoff/`: completed manual same-session takeover and resume;
- `validation/`: full local test output (34/34 passed).

The synthetic purchase demo ends at its declared `HUMAN APPROVAL REQUIRED` checkpoint after the human clicks Submit purchase; no real purchase is executed.

## What stays outside the first submission

The repository is already growing follow-on seams, while the take-home remains one browser slice.

Design/follow-on work includes:

- remote desktop / VM execution;
- Preflight/Starsector semantic control;
- richer compatibility fingerprints;
- multi-tenant variants;
- capability confidence and retirement;
- capability composition;
- model routing;
- checkpoint search and policy distillation.

Those are extensions of the same contracts, not extra dependencies for the reviewer.
