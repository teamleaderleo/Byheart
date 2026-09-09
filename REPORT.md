# Architecture

Byheart separates model-driven discovery from deterministic replay. A surface adapter owns observation and action mechanics. Discovery records a bounded external action trace. A compiler converts successful behavior into a typed capability. Replay validates inputs, policy, surface identity, preconditions, action effects, known outcomes, recovery rules, and final checkpoints. Evidence and control ownership are shared cross-cutting concerns.

The first concrete surface will be a browser because it makes the end-to-end project easy to reproduce, while the core `Surface` contract also admits accessibility, screenshot/coordinate, remote-desktop, and domain-semantic adapters.

# Artifact schema

A `byheart-capability/v1` artifact declares target, compatibility metadata, typed inputs/outputs, ordered steps, target locators or semantic actions, pre/post conditions, known outcomes, recoveries, final success conditions, extraction rules, policy, and provenance.

The artifact is decoupled from model reasoning. A reviewer can understand what it needs, what it does, what it returns, and which conditions stop or redirect execution.

# Determinism & error handling

Replay contains no model decision loop. Inputs are rendered into the saved steps, each action is checked against policy, and the surface must report delivery and observed effect separately. Steps may declare expected postconditions, known domain outcomes, bounded recovery actions, and retry limits. Final success conditions are checked independently before outputs are returned.

The result contract separates `success`, `known_outcome`, `failure`, and `intervention_required`. Failure carries the step and debuggable expectation/observation detail. The browser adapter will add stable semantic locator ordering, bounded waits, and richer failure evidence.

# Heterogeneity & multi-tenant

The capability is expressed above the surface mechanism. Browser locators, accessibility nodes, screenshot points, remote-desktop coordinates, and game-semantic actions can all sit behind the same surface contract. Compatibility metadata can bind a capability to app/vendor/version identity while allowing reviewed per-variant overrides.

For shared vendor products, the intended model is a base capability plus variant-specific compatibility/locator overrides, with replay evidence determining whether a variant remains eligible. This is design-only in the first implementation.

# Escalation & handoff

Ownership is an explicit state machine: automation-owned → paused-for-review → human-owned → returning-to-automation → automation-owned. A consequential action or unrecoverable/unknown state can pause the same live session and return `intervention_required` with session identity and evidence. The first operator interface will expose that same browser session and a resume signal while appending human activity to the run evidence.

# Safety

Each action is checked against a capability policy that constrains adapters, entrypoints/origins, action kinds, and named consequential actions. Consequential actions may be blocked, allowed, or require a human. Structured evidence passes through a central redaction boundary before persistence. Live credentials and raw sensitive data are excluded from capability artifacts and logs.

# Cuts

The first submission will implement one browser surface and one real LLM discovery path. Native desktop/remote-desktop adapters, Starsector integration, multi-tenant variant inheritance, capability composition, confidence scoring, and model routing remain follow-on work. The operator UI will be deliberately minimal while the pause/control-transfer/resume mechanism remains real.
