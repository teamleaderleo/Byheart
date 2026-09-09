# Byheart architecture

Byheart turns successful computer-use experience into executable skills.

The first principle is:

```text
reason when the system is uncertain
compile what becomes understood
replay what is already known
escalate when the proof stops holding
```

## The core objects

### Surface

A `Surface` is the live thing being operated: browser, native app, remote desktop, VM, game, or semantic adapter.

```text
identity()         exact live-session identity
observe()          what is true now
act()              deliver one bounded action
check()            verify a condition
extract()          return declared output data
captureEvidence()  retain a receipt/screenshot/snapshot
pause()/resume()   transfer control without replacing the session
```

The surface owns mechanism. A capability owns intent.

### Discovery session

A `DiscoverySession` is the durable live boundary between reasoning and execution.

It owns:

- goal and target;
- live `Surface`;
- allowed action kinds and entrypoints;
- consequence policy;
- step limit;
- current observation;
- action receipts;
- evidence;
- successful external trace.

The reasoning driver can be Codex, ChatGPT computer use, another model runtime, a human experimenter, or the optional embedded `DecisionModel` adapter.

```text
reasoning driver
  ↓ chooses one action
DiscoverySession
  ↓ policy
Surface.act
  ↓
receipt + next observation
```

This keeps the thing being learned independent from the thing doing the learning.

### External discovery bridge

The default Codex-facing path exposes one resident discovery session over localhost:

```text
GET  /v1/state
POST /v1/action
POST /v1/done
POST /v1/stuck
GET  /v1/screenshot
```

The bridge parses typed actions, keeps the same target session alive, and refuses `done` until Byheart independently verifies the declared success condition.

### Discovery trace

The trace records the external facts needed for compilation:

```text
observation
chosen bounded action
receipt: delivered / effect observed / detail
next observation
```

Private chain-of-thought is outside the artifact. Short action notes can be retained when they help a reviewer understand the decision.

### Capability

A capability is a typed executable contract:

- target and compatibility;
- inputs and outputs;
- ordered steps;
- target descriptions;
- preconditions and postconditions;
- known outcomes;
- recoveries and retry bounds;
- final checkpoints;
- policy;
- provenance.

The capability should remain understandable after the discovery session is gone.

### Run result

Replay returns one of four outcomes:

- `success` — checkpoint verified, declared outputs returned;
- `known_outcome` — legitimate domain result such as record missing;
- `failure` — debuggable execution failure;
- `intervention_required` — same live session paused for human control.

Delivery and effect are separate facts. An expected domain result is a result, not a crash.

## Discovery versus replay

Discovery can spend intelligence:

```text
agent
  ↓ observation
  ↓ decision
  ↓ action
  ↓ receipt
repeat
```

Replay cannot:

```text
capability + inputs
  ↓ render
  ↓ policy
  ↓ action
  ↓ check
  ↓ next saved step
```

The replay engine never asks a model what to click next.

## Execution ladder

Behavior can move downward as it becomes understood:

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

A strong agent can teach a procedure. A cheaper agent can later choose among procedures. Routine cases can become deterministic evaluators.

## Surface adapters

Current or started adapters:

```text
browser / Playwright             implemented
scripted test surface            implemented
remote desktop HTTP transport    implemented contract
Preflight / Starsector            implemented closed-action adapter
```

Future adapters include native accessibility and richer hybrid surfaces.

Hybrid adapters are first-class. A run can observe pixels while executing a reviewed semantic action, or use accessibility for targeting and screenshots for independent evidence.

## Browser targeting

Prefer semantic identity over incidental position:

1. role + accessible name;
2. label/control relation;
3. stable text plus context;
4. reviewed selector;
5. bounded point fallback.

The Playwright adapter searches across frames and requires a semantic target to resolve uniquely.

## Remote desktop

The remote surface is the universal lowest-common-denominator route:

```text
session identity
  ↓
screenshot frame
  ↓
mouse / keyboard / text / drag
  ↓
new frame + receipt
```

Its transport separates session metadata, frame capture, and bounded input. Resolution and session changes can invalidate a capability instead of silently changing coordinate meaning.

A guest helper may add semantic state later, while screenshots remain useful as an independent witness.

## Preflight / Starsector

Preflight already has a narrow in-JVM developer control protocol with exact process-lifetime identity, semantic runtime state, and request/receipt actions. The Byheart adapter treats that protocol as the lower game-control boundary instead of inventing reflection calls.

```text
Byheart planner / capability
  ↓ semantic action
Preflight request/receipt transport
  ↓ reviewed game-thread boundary
Starsector
```

Preflight owns game/process/save correctness. Byheart can own planning, learned procedures, checkpoint search, and capability composition.

Campaign play is a particularly attractive research target because the game can pause. Time can become a bounded control primitive: inspect, plan, resume briefly, pause on a trigger, and replan.

## Runtime errors

A capability step can carry:

- `before` conditions;
- `after` conditions;
- `knownOutcomes`;
- bounded `recoveries`;
- bounded `retry`;
- `onFailure: human`.

The engine checks these instead of blindly continuing.

## Safety

Every replay action passes through policy before delivery.

Current policy can constrain:

- adapter;
- entrypoint/origin;
- navigation destination;
- action kind;
- named/marked consequential actions;
- disposition of consequential work: block, require human, or allow.

Discovery uses the same policy idea. The external agent can think freely while its side effects stay inside Byheart's declared action boundary.

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

The live surface remains the same object throughout the handoff. Human interventions can later become evidence for another discovery/compilation pass.

## Game learning path

### Starsector

The high-value problem is campaign judgment plus UI operation:

- route planning;
- pause/resume movement;
- patrol evasion;
- transponder / go-dark / burn decisions;
- trading and smuggling;
- mission bundling;
- resource constraints;
- strategic blueprint/hull/weapon acquisitions;
- checkpointed comparison of several plans.

A read-only advisor can deterministically compute quantities and candidate opportunity frontiers, leaving strategic ambiguity to the reasoning agent.

### Battle Brothers

Turn boundaries create natural decision points. UI procedures can become capabilities while tactical decisions and roster economics remain planner inputs. Checkpointed encounters make policy comparison cheap.

## Current implementation

The repository has a complete browser take-home path plus the beginning of the broader project:

- typed capability/result contracts;
- validation and templates;
- allowlist/consequence policy;
- deterministic replay;
- known outcomes and bounded recovery;
- ownership state machine;
- redacted evidence;
- resident external discovery session;
- Codex-friendly discovery bridge;
- optional embedded decision-model runner;
- trace compiler;
- Playwright browser adapter;
- remote-desktop adapter contract;
- Preflight/Starsector adapter;
- browser integration tests and synthetic demo target.

The next meaningful proof is a retained genuine Codex teach run, followed by the first real remote-desktop and Starsector experiments.
