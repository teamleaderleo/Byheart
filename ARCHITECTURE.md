# Byheart architecture

Byheart turns successful computer-use experience into executable skills.

The first principle is simple:

```text
reason when the system is uncertain
compile what becomes understood
replay what is already known
escalate when the proof stops holding
```

## The four objects

### 1. Surface

A `Surface` is the live thing being operated: browser, native app, remote desktop, VM, game, or semantic adapter.

```text
identity()       exact live-session identity
observe()        what is true now
act()            deliver one bounded action
check()          verify a condition
extract()        return declared output data
captureEvidence() retain a receipt/screenshot/snapshot
pause()/resume() transfer control without replacing the session
```

The surface owns mechanism. A capability owns intent.

### 2. Discovery trace

Discovery is the expensive path. A model repeatedly observes and chooses one bounded action. Byheart retains the useful external trace, not a private reasoning transcript.

```text
goal
  ↓
observation → model decision → policy → action → receipt
  ↓
repeat until success / stuck / limit
```

The trace is evidence and compilation input.

### 3. Capability

A capability is a typed executable contract:

- target and compatibility;
- inputs and outputs;
- ordered steps;
- robust target descriptions;
- preconditions and postconditions;
- known outcomes;
- recoveries and retry bounds;
- final checkpoints;
- policy;
- provenance.

The capability should remain understandable when the discovery transcript is gone.

### 4. Run result

Replay returns one of four outcomes:

- `success` — checkpoint verified, declared outputs returned;
- `known_outcome` — legitimate domain result such as record missing;
- `failure` — debuggable execution failure;
- `intervention_required` — same live session paused for human control.

That distinction is central. Delivery is not effect, and an expected domain result is not a crash.

## Execution ladder

Byheart is designed for behavior to move downward as it becomes understood.

```text
strong planner
    ↓
local/tactical model
    ↓
capability selection
    ↓
deterministic replay
    ↓
reflex / semantic action
```

A large model can teach a procedure. A cheaper model can later choose among procedures. Routine cases can eventually become deterministic evaluators.

The point is not to remove reasoning everywhere. The point is to spend it where uncertainty survives.

## Surface adapters

Planned adapters:

```text
browser / Playwright
native accessibility
screenshot + coordinates
remote desktop
VM guest helper
Preflight / Starsector semantic control
hybrid adapters
```

Hybrid adapters are first-class. A run can observe pixels while executing a reviewed semantic action, or use accessibility for targeting and screenshots for evidence.

## Capability targeting

Targeting should prefer semantic identity over incidental position.

For browsers:

1. role + accessible name;
2. label/control relation;
3. stable text plus context;
4. reviewed selector;
5. bounded point fallback.

For remote desktops and games, equivalent identities may come from accessibility nodes, semantic guest state, process identity, domain object ids, or pixels.

The artifact records the target and why it should remain valid.

## Runtime errors

Replay treats runtime conditions explicitly.

A step can carry:

- `before` conditions;
- `after` conditions;
- `knownOutcomes`;
- bounded `recoveries`;
- bounded `retry`.

The engine checks these rather than blindly continuing.

## Safety

Every action passes through policy before delivery.

Current policy can constrain:

- adapter;
- entrypoint/origin;
- action kind;
- named consequential actions;
- disposition of consequential work: block, require human, or allow.

Evidence goes through a shared redaction boundary before persistence.

## Human handoff

Ownership is explicit:

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

The live surface remains the same object throughout the handoff. Human actions can later become evidence for another discovery/compilation pass.

## Game research path

Games expose the research idea unusually clearly.

### Starsector

Preflight already has exact process identity, bounded semantic actions, state receipts, checkpoint-copy thinking, and campaign/combat instrumentation. Byheart can sit above that and own:

- UI exploration;
- campaign planning;
- movement/evasion in pause/resume increments;
- trading/smuggling procedures;
- opportunity selection;
- capability compilation;
- checkpointed plan comparison.

A read-only advisor mod can expose quantities and opportunity candidates while Byheart still operates the game.

### Battle Brothers

Turn boundaries create natural model decision points. UI procedures can become capabilities while tactical decisions and roster economics remain planner inputs. Checkpointed encounters make policy comparison cheap.

## Remote desktop path

A remote-desktop adapter is the universal lowest-common-denominator surface:

```text
screenshot → mouse/keyboard → screenshot
```

That gives immediate access to Linux, Windows VMs, Moonlight sessions, launchers, games, installers, and old desktop software. Guest-side semantic adapters can replace stable pieces over time.

## Current implementation

The repository now has a dependency-light core:

- typed capability/result contracts;
- template rendering;
- validation;
- allowlist/consequence policy;
- deterministic replay;
- known outcomes;
- bounded recovery/retry hooks;
- ownership state machine;
- redacted structured evidence;
- model-facing discovery loop;
- trace-to-capability compiler;
- scripted adapter and tests.

The next hard milestone is a real browser surface plus one genuine LLM-driven discovery run.
