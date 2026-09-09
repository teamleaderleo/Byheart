# Take-home evidence

This directory is the submission evidence bundle.

Captured on 2026-09-09. All eight submission checklist items below are present. The commands in this document reproduce the runs; rerunning them replaces or appends evidence, so preserve this captured bundle first.

## Captured submission

| Checklist item | Retained evidence | Verified result |
| --- | --- | --- |
| Genuine external-model discovery and compiled artifact | [trace](discovery/trace.json), [capability](discovery/capability.json), [redacted log](discovery/discovery.jsonl), [durability memo](discovery/DURABILITY.md) | Codex chose seven successful actions through one resident bridge; stopped at ORDER STAGED |
| Discovery screenshots | [final screenshot](discovery/screenshots/0023-discovery-final.png), 23 screenshots in `discovery/screenshots/` | ASH-17, 25 supplies, STG-001, 3600 credits |
| Success with typed outputs | [generated result](generated/replay-success/result.json) | VES-04 / 10 → STG-001, quantity 10, total 2120 |
| Expected market_not_found | [result](generated/replay-known-outcome/result.json) | `known_outcome`, code `market_not_found` |
| Session-expiry recovery | [result](generated/replay-session-recovery/result.json), [events](generated/replay-session-recovery/events.jsonl) | Three recovery actions at `wait-market`, then success |
| Deliberate hard failure | [result](generated/replay-hard-failure/result.json) | `failure`, `action_failed`, `open-order` |
| Consequence-boundary intervention | [result](generated/replay-consequence-boundary/result.json) | `intervention_required` before `submit-purchase` |
| Manual same-session takeover/resume | [result](handoff/result.json), [log](handoff/replay.jsonl), [final screenshot](handoff/screenshots/0018-replay-success.png) | Human click, operator resume, postcondition verified, success |

The discovery capability declares string inputs `market` and `quantity`, string outputs `reference` and `market`, and numeric outputs `quantity` and `total_credits`. Two distinct deterministic invocations of this exact compiled artifact succeeded: [VES-04 / 10](replay-from-discovery/result.json) and [ASH-17 / 25](replay-from-discovery-ash17/result.json). Its automatically maintained [candidate](discovery/capability.candidate.json) is verified.

Discovery run: `923e3991-18ea-40b9-8310-fe8482ba7e93`. Handoff run: `a2fbad68-c8cf-4c19-9c71-177e17783347`. Handoff session: `3bff1b50-8d2a-4380-b6a8-fc1325e7ddef`, unchanged across `paused_for_review`, `human_owned`, and `automation_resumed`. The log contains no automated receipt for `submit-purchase`; its `after-human` check passes. The synthetic target's declared final checkpoint is `HUMAN APPROVAL REQUIRED`, not an executed purchase.

Local validation: `npm test` passed 34/34 tests; the [unmodified test output](validation/npm-test.txt) is retained. `npm run evidence:replays` passed all five expected-result assertions. Screenshots and JSON/JSONL files were checked for integrity; referenced evidence files are present. Runtime `file://` references retain their original capture paths; after cloning elsewhere, resolve the suffix starting at `evidence/` against the repository root. The existing `starsector/` material is separate research evidence, not part of this take-home demonstration.

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

- [x] a genuine external-model discovery trace and its compiled artifact;
- [x] screenshots from that discovery;
- [x] deterministic success replay with typed outputs;
- [x] an expected `market_not_found` outcome;
- [x] a successful session-expiry recovery;
- [x] a hard failure with evidence;
- [x] a consequence-boundary/intervention result;
- [x] one manual same-session takeover/resume run.

Do not commit credentials, cookies, or real customer data. The demo target contains synthetic data only.
