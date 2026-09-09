# Take-home evidence

This directory is the submission evidence bundle.

The checked-in repository provides the machinery and exact commands. The final submission should retain one genuine model-driven discovery run plus deterministic replay evidence here.

## 1. Genuine Codex discovery

Start the demo target:

```bash
npm install
npm run browser:install
npm run demo:target
```

In a second terminal:

```bash
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

Give Codex `CODEX.md` and the printed bridge URL. The discovery actions must pass through the resident bridge. When `POST /v1/done` succeeds, retain:

```text
evidence/discovery/
  capability.json
  discovery.jsonl
  trace.json
  DURABILITY.md
  screenshots/
```

The artifact should have typed inputs and typed outputs. On the ASH-17 / 25-supplies run the UI exposes `reference`, `market`, `quantity`, and `total_credits` as extraction targets.

## 2. Deterministic replay bundle

After installing/building, run:

```bash
npm run evidence:replays
```

This regenerates `evidence/generated/` with five deterministic cases:

```text
replay-success/
replay-known-outcome/
replay-session-recovery/
replay-hard-failure/
replay-consequence-boundary/
manifest.json
```

Each case contains a redacted JSONL event log, `result.json`, and screenshots. `replay-success` demonstrates typed outputs. `replay-known-outcome` shows `market_not_found` as a domain result. `replay-session-recovery` exercises the explicit re-authentication recovery. `replay-hard-failure` deliberately changes a target so the failure remains debuggable. `replay-consequence-boundary` proves automation stops before the consequential purchase action.

## 3. Manual same-session takeover

Run the target, then:

```bash
npm run byheart -- replay \
  --capability examples/capabilities/stage-and-submit-order.json \
  --input market=ASH-17 \
  --input quantity=25 \
  --run-dir evidence/handoff \
  --operator \
  --headed
```

Byheart drives the reversible steps, then transfers ownership before `Submit purchase`. Operate the same headed browser manually, use the operator surface to return control, and retain `evidence/handoff/`.

The useful proof is the preserved session id plus the handoff phases in the structured log. Do not replace this with a fresh browser/session.

## Submission evidence checklist

Before sending the repository, verify that `/evidence/` contains:

- a genuine external-model discovery trace and its compiled artifact;
- screenshots from that discovery;
- deterministic success replay with typed outputs;
- an expected `market_not_found` outcome;
- a successful session-expiry recovery;
- a hard failure with evidence;
- a consequence-boundary/intervention result;
- one manual same-session takeover/resume run.

Do not commit credentials, cookies, or real customer data. The demo target contains synthetic data only.
