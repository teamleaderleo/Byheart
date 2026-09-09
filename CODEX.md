# Codex as Byheart's primary discovery driver

Byheart does not need to own the reasoning model.

The preferred development/research loop is:

```text
Codex
  ↓ decides what to do next
Byheart resident discovery session
  ↓ validates + executes
real surface
  ↓ observation + receipt + screenshot
Codex
  ↓
...
success
  ↓
Byheart compiles the trace
  ↓
deterministic capability
```

This has two advantages over hiding the model behind a provider API:

1. Codex can inspect the repository, source, logs, screenshots, adapters, and target behavior while it works.
2. The discovery contract stays provider-independent. Any capable agent can drive the same local protocol later.

## Browser demo

Terminal 1:

```bash
npm install
npm run browser:install
npm run demo:target
```

Terminal 2:

```bash
npm run build
node dist/src/cli.js teach \
  --url http://127.0.0.1:4173 \
  --goal "Find market ASH-17 and stage an order for 25 supplies. Stop at ORDER STAGED; do not submit a purchase." \
  --success-text "ORDER STAGED" \
  --parameter market=ASH-17 \
  --parameter quantity=25 \
  --known-outcome market_not_found="NO SUCH MARKET" \
  --name stage-supplies-order \
  --output runtime/stage-supplies-order.json \
  --run-dir evidence/codex-discovery
```

The command prints a local bridge URL such as `http://127.0.0.1:43127` and keeps the same browser/session resident.

## What Codex should do

Use the bridge as the action boundary. Do not bypass it with a separate Playwright/browser instance during the discovery run, because the trace should contain the actions that actually solved the task.

1. `GET <bridge>/v1/state`.
2. Read the observation. Open `<bridge>/v1/screenshot` when visual context helps.
3. Choose one bounded action.
4. `POST <bridge>/v1/action` with the action JSON and a short external-facing note.
5. Read the returned receipt and next observation.
6. Repeat.
7. When the declared success condition is visibly true, `POST <bridge>/v1/done`.
8. If progress is genuinely blocked, `POST <bridge>/v1/stuck` with the reason.

Example actions:

```json
{"action":{"kind":"type","target":{"kind":"label","label":"Market code"},"text":"ASH-17"},"note":"Enter the requested market code."}
```

```json
{"action":{"kind":"click","target":{"kind":"role","role":"button","name":"Search"}},"note":"Run the market lookup."}
```

```json
{"action":{"kind":"select","target":{"kind":"label","label":"Commodity"},"value":"supplies"}}
```

For a screenshot/remote-desktop surface, point actions are valid:

```json
{"action":{"kind":"click","target":{"kind":"point","x":812,"y":526,"coordinateSpace":"surface"}}}
```

For Preflight/Starsector, the reviewed game adapter uses closed semantic actions:

```json
{"action":{"kind":"semantic","name":"campaign.pause"}}
```

## Discovery rules

- Prefer role/name, labels, and stable text on browser surfaces.
- Use pixels when pixels are genuinely the available interface.
- Treat `delivered` and `effectObserved` as separate facts.
- Keep one action per decision.
- Read the post-action observation before choosing the next action.
- Let Byheart enforce origin/action/consequence policy.
- Stop and report an undeclared state instead of silently inventing a new privileged action.
- Keep decision notes short enough to become useful evidence; private reasoning does not belong in the trace.

## After discovery

`teach` verifies the declared success condition, compiles the successful external-action trace, parameterizes the supplied concrete values, stores evidence, and exits.

It also writes a sibling durability candidate next to the capability. For example:

```text
runtime/stage-supplies-order.json
runtime/stage-supplies-order.candidate.json
```

Replay uses no model decision loop:

```bash
node dist/src/cli.js replay \
  --capability runtime/stage-supplies-order.json \
  --input market=VES-04 \
  --input quantity=10
```

Distinct successful invocations are counted as verification evidence. A real failure moves the candidate to `needs_review` instead of letting success counts hide a compatibility problem.

Once verified:

```bash
node dist/src/cli.js promote \
  --candidate runtime/stage-supplies-order.candidate.json
```

Promotion creates `.byheart/skills/<id>/vN/SKILL.md`, a frozen capability copy, and `.byheart/skills/index.json`. The wrapper tells future Codex runs when to use deterministic replay and when to return to exploration.

## The durability pass

Do this after ordinary successful work too, even when the work did not start in Byheart.

Ask briefly:

1. What did I have to rediscover?
2. What part could be a command/helper/script instead of repeated reasoning or clicking?
3. Is there a stable recovery I should encode?
4. Does this belong as one capability or several composable skills?
5. What one or two variations would prove the durable form actually generalizes?

If the answer is obvious, make the improvement now. A three-command helper is better than preserving twenty UI steps. A short repository instruction is better than a fake abstraction. If the idea needs proof, leave a candidate and verification recipe instead of pretending it is trusted.

Before doing familiar work from scratch, check `.byheart/skills/index.json` when it exists. Use a verified deterministic skill first; fall back to normal Codex judgment when its compatibility checks stop holding.

For a same-session human intervention demo:

```bash
node dist/src/cli.js replay \
  --capability examples/capabilities/stage-and-submit-order.json \
  --input market=ASH-17 \
  --input quantity=25 \
  --operator --headed
```

## Optional direct API driver

`teach-api` remains available as a portable standalone route when a provider API is useful. It is an adapter, not the center of Byheart. The normal project path is the resident discovery session above.
