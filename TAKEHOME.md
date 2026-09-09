# Byheart as the computer-use take-home

The interview assignment can fund the first real Byheart implementation.

The assignment's central loop is already close to the Byheart thesis:

```text
natural-language goal
  ↓
LLM-driven discovery against a real UI
  ↓
successful run
  ↓
typed reusable artifact
  ↓
deterministic replay
  ↓
result / known outcome / failure / human intervention
```

The submission should satisfy that brief directly while keeping the implementation generic enough to survive afterward.

## What the assignment requires

The required vertical slice needs:

- natural-language goal + target;
- real UI interaction;
- LLM observe/decide/act loop;
- typed, versioned capability artifact;
- typed inputs and outputs;
- deterministic replay without model decisions;
- stable target identification;
- explicit expected outcomes, recoverable conditions, and hard failures;
- allowlisted domains/actions;
- conservative handling of consequential actions;
- redacted logs/artifacts;
- execution evidence;
- human takeover of the same live session;
- a short design write-up;
- one end-to-end demonstration and preferably one exceptional replay.

The brief explicitly allows one concrete surface, a mocked/minimal operator UI, and design-only treatment of broader desktop/multi-tenant support.

## Suggested architecture

```text
                    ┌─────────────────────┐
 goal + target ────►│ Discovery controller│
                    └─────────┬───────────┘
                              │
                         model decisions
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Surface adapter   │
                    │ observe / act / grab│
                    └─────────┬───────────┘
                              │
                         successful trace
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Capability compiler │
                    └─────────┬───────────┘
                              │
                        capability.yaml
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
        deterministic replay        human inspection
                 │
                 ▼
       result + outputs + evidence
```

Small modules are enough:

- `surface` — observation and action boundary;
- `discovery` — model loop;
- `capability` — schema and compiler;
- `replay` — deterministic executor;
- `policy` — allowlists and consequence checks;
- `evidence` — logs/screenshots/trace;
- `handoff` — pause/ownership/resume.

## Capability sketch

The capability should be understandable without the model transcript.

```yaml
format: byheart-capability/v1
name: change_demo_setting
version: 1

target:
  adapter: browser
  entrypoint: http://localhost:3000

inputs:
  profile:
    type: string

outputs:
  active_profile:
    type: string

steps:
  - id: open-options
    action: click
    target:
      strategy: role_name
      role: button
      name: Options

  - id: choose-profile
    action: select
    target:
      strategy: label
      label: Profile
    value: "{{ profile }}"

checkpoint:
  type: text_present
  value: "{{ profile }}"

policy:
  allowed_actions: [click, select, read]
  risk: reversible
```

The real schema can carry locator fallbacks, waits, expected pre/post state, known outcomes, extraction rules, evidence references, and compatibility metadata.

## Result contract

A clean result union seems important:

```text
success
  outputs
  checkpoint evidence

known_outcome
  code
  details
  example: record_not_found

failure
  class
  step
  expected
  observed
  evidence

intervention_required
  reason
  live_session
  step
  evidence
```

This avoids treating an ordinary domain result as a crash.

## Locator strategy

For a browser first implementation, prefer semantic targeting in roughly this order where available:

1. role + accessible name;
2. label/control relationship;
3. stable text plus local context;
4. stable attribute/selector;
5. bounded screenshot/coordinate fallback where the adapter supports it.

The artifact should record why the chosen locator is expected to survive.

Later adapters can implement equivalent target descriptions with accessibility trees, OS controls, screenshots, or domain-specific semantic actions.

## Human handoff

The simplest real handoff model:

```text
automation_owned
      ↓ stuck / risky
paused
      ↓
human_owned
      ↓ operator acts in same session
resume_requested
      ↓
automation_owned
```

A tiny operator page can show:

- current goal;
- capability/run id;
- current step;
- screenshot;
- stop reason;
- live browser/session view;
- Resume button.

Human actions should append to the same evidence trail.

## Demo target choices

### Option A — local purpose-built demo app

Best for reliable submission speed.

Build a small admin/game-like app with:

- search;
- detail page;
- multi-step action;
- confirmation state;
- injected runtime errors;
- one risky action;
- one odd modal/interstitial.

This gives complete control over exceptional states while still exercising real UI interaction.

### Option B — Preflight browser preview

More personally useful and visually distinctive.

Possible task:

> Open Options, activate a named profile/setting, return Home, and verify the expected state.

Advantages:

- real existing product;
- existing Playwright/rendered-acceptance work;
- natural future use as AI-authored UI acceptance flows.

Risks:

- coupling interview setup to another substantial repository;
- state/setup requirements may complicate reviewer reproduction.

### Option C — remote desktop / VM

Most faithful to the legacy/no-DOM premise and most impressive if clean.

Possible flow against a tiny app inside the VM:

- connect to session;
- visually find application;
- complete form/workflow;
- compile and replay.

Risks:

- setup burden;
- reviewer reproducibility;
- remote-session flakiness.

### Option D — Starsector

Excellent future Byheart demo; poor first take-home dependency unless the whole path is already packaged for strangers.

Use it after the generic core works.

## Current recommendation

Build the generic core with a browser adapter and a small locally controlled target. Make the target feel like a real product instead of a toy form.

Then, if time permits, add one personally meaningful adapter/demo:

- Preflight UI flow, or
- a tiny remote-desktop proof.

Keep Starsector as the immediate post-submission experiment.

This gives the evaluator a trivial setup path while preserving Byheart's future.

## Exceptional-state demo

The target should make runtime failures easy to trigger intentionally.

Examples:

- invalid search id → `known_outcome`;
- temporary loading overlay → recoverable retry;
- expired session modal → known recovery path;
- unexpected confirmation dialog → intervention;
- removed/changed target control → hard failure with screenshot.

One command should demonstrate each relevant outcome.

## Evidence layout

The assignment asks for `/evidence/`.

Possible files:

```text
evidence/
  discovery-run.jsonl
  replay-run.jsonl
  replay-known-outcome.jsonl
  capability-example.yaml
  discovery-final.png
  replay-final.png
  replay-failure.png
```

Every run should identify:

- goal;
- target;
- capability version;
- input params;
- start/end time;
- actions;
- checkpoints;
- result;
- evidence files.

The model's private reasoning transcript does not need to become the capability. A concise decision/action log is enough for review.

## Safety model

Keep it simple and explicit.

Example policy:

```yaml
allowed_origins:
  - http://localhost:3000
allowed_actions:
  - click
  - type
  - select
  - read
  - navigate

consequential_actions:
  - submit_purchase
  - delete
  - external_send

consequential_policy: require_human
```

Before every action, policy sees the proposed action and current target.

Logs run through one redaction function before persistence.

## What to defer

The first implementation can leave these as seams/design notes:

- desktop accessibility adapter;
- remote-desktop adapter;
- Starsector adapter;
- multi-tenant variant inheritance;
- sophisticated locator scoring;
- automatic policy extraction from traces;
- learned model routing;
- capability composition;
- cross-run capability confidence;
- automatic recovery with an LLM.

The assignment values a complete thin slice over breadth.

## Post-submission path

Once the take-home is accepted as a working core:

1. connect a remote-desktop adapter;
2. connect Preflight's semantic game-control channel;
3. implement screenshot + campaign-state observation;
4. teach a few Starsector campaign actions;
5. try a checkpointed route-planning/evasion experiment;
6. start compiling repeated UI procedures into capabilities;
7. add a planner that calls the capability catalog.

At that point the interview homework has become the beginning of the actual project.
