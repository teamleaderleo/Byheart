# Architecture

Byheart separates model-driven discovery from deterministic replay.

A `Surface` owns how a live application is perceived and acted on: identity, observation, bounded actions, conditions, output extraction, screenshots/evidence, and pause/resume. The current concrete adapter is Playwright. It observes the top page plus every frame, records visible control metadata and dialog state, targets controls semantically across frame boundaries, and retains screenshots. The core contract also admits accessibility, screenshot/coordinate, remote-desktop, and domain-semantic adapters.

Discovery is an observe → decide → act loop. The model receives the goal, current surface description, and a bounded recent execution trace; it returns exactly one typed action, `done`, or `stuck`. Byheart records external decisions/actions/receipts instead of model-private reasoning. A compiler turns a successful trace into a parameterized capability.

Replay is a separate engine with no model decision loop. It renders invocation parameters into the saved capability, checks policy and preconditions, performs the recorded actions, verifies effects/checkpoints, handles declared outcomes/recoveries, extracts outputs, and returns a typed result.

This is intentionally a small single-process implementation. The interesting boundaries are explicit without adding queues or services that the vertical slice does not need.

# Artifact schema

A `byheart-capability/v1` artifact is an agent-invocable contract rather than a transcript. It declares:

- stable id, name, version, description, target adapter/entrypoint, and compatibility metadata;
- typed invocation inputs and outputs;
- ordered steps containing typed actions;
- semantic locators (`role`, `label`, `text`) plus reviewed selector/point/semantic fallbacks;
- optional preconditions and postconditions;
- known domain outcomes;
- bounded recovery actions and retry policy;
- whether an unrecovered step should fail or request a human;
- final success checkpoints and extraction rules;
- the action/adapter/entrypoint safety policy;
- discovery provenance and evidence references.

The model transcript is deliberately absent. A reviewer can understand what the capability needs, what it will do, what states it recognizes, what it returns, and which actions can cross a consequence boundary.

Successful discovery traces can be parameterized while compiling. For example, a trace learned with market `ASH-17` and quantity `25` can emit `{{input.market}}` and `{{input.quantity}}`, then replay with different values.

# Determinism & error handling

Replay never asks a model what to do next. The same artifact plus invocation parameters produces the same ordered action plan. Each action is resolved through the surface adapter and produces a receipt that separates **delivered** from **effect observed**. This avoids treating a successful click/input call as proof that the application transitioned correctly.

The Playwright adapter searches the top page and every iframe and requires semantic targets to resolve exactly once. Role + accessible name and labels are preferred; selectors and points remain explicit fallbacks. Waits are bounded. Final checkpoints are independent from action delivery.

The result contract has four top-level outcomes:

- `success` with declared outputs;
- `known_outcome` for legitimate domain results such as `market_not_found`;
- `failure` with class, step, expected/observed detail, and evidence;
- `intervention_required` with the same live session identity.

The local Perihelion Exchange target exercises several runtime conditions. `NO SUCH MARKET` is a known outcome. A session-expiry state has an explicit recovery through the ordinary Re-authenticate UI, followed by bounded retry. A surprise dialog can route the live browser to a human. Injected slowness is handled through condition waits instead of sleeps. Locator/state mismatches surface as debuggable failures.

# Heterogeneity & multi-tenant

The seam is the `Surface` contract. Capability intent stays above browser DOM, accessibility APIs, screenshot coordinates, remote-desktop input, or a game-semantic protocol. A hybrid adapter can observe pixels while executing a reviewed semantic action, or use accessibility for targeting and screenshots for evidence.

For real bank deployments, I would model a shared vendor capability separately from tenant/version compatibility. A base capability would own the semantic flow; a reviewed variant layer could override entrypoint fingerprints or individual target strategies. Eligibility would depend on explicit app/version/tenant evidence and replay history. Unknown variants would decline or escalate instead of silently inheriting a brittle selector.

The current project implements one browser target. Multi-tenant inheritance and desktop/remote adapters remain design work because implementing them would add breadth without improving the evaluated vertical slice.

# Escalation & handoff

Control ownership is explicit:

`automation_owned → paused_for_review → human_owned → returning_to_automation → automation_owned`.

A consequential action or a step marked `onFailure: human` pauses automation before further action. The Playwright browser remains alive. A small local operator surface shows the run, capability, step, reason, session id, and latest screenshot. The human operates the same live target browser directly, then chooses **Resume automation** or **Stop run**.

On resume, Byheart transitions ownership back to automation and verifies the interrupted step's declared postcondition before continuing. The handoff phases are retained in the structured evidence log. This makes the control-transfer mechanism real while keeping the operator UI deliberately small.

# Safety

Every replay action passes through an explicit policy before delivery. The policy constrains adapter type, action types, current entrypoint, navigation destinations, and consequential actions. A consequential action can be blocked, allowed, or require human control. The demo purchase capability marks only its final `Submit purchase` click as consequential, so replay drives the reversible setup and stops before that boundary.

Structured evidence goes through a shared redaction pass for obvious secret-bearing fields before persistence. Credentials remain environment variables and are excluded from artifacts. The local demo contains synthetic data only.

The browser policy also validates navigation destinations against the allowlist instead of trusting a capability merely because it began on an allowed page.

# Cuts

The submission focuses on one reproducible browser surface and one complete capability lifecycle. Native desktop/remote-desktop adapters, Starsector/Preflight integration, cross-tenant inheritance, capability composition, approval/stability scoring, automatic parameter discovery beyond explicit bindings, and model routing are follow-on work.

The remaining submission task is operational rather than architectural: run one genuine model-driven discovery against the live local target with an API key and retain that discovery artifact/log/screenshots under `/evidence/`, then retain deterministic success plus exceptional replay evidence beside it. The code path for that run is implemented in the `teach` CLI.
