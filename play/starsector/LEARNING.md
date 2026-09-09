# Learning ledger

Use this for unresolved learning. Promote stable conclusions to `PLAYBOOK.md`.

## Open questions

- What early-game start and fleet direction does this installed game make attractive?
- Which campaign actions are still awkward enough to deserve a helper, semantic action, or Byheart capability?

## Hypotheses to test

- [observed] The Academy research invitation did not provide paid work: Project Sonic is a 5,000-fuel donation. Standard jobs were blocked by starting story state. Inspect actual offer terms before treating an intel marker as income.
- [hypothesis] The free Strange Quantum Cube is an exploration lead; its NPC mentions EidoloN. Its mod-specific consequences are unknown.

## Mistakes and surprises

- [observed] A supposedly read-only capture originally used an attach that clicked window center. Fixed before continued play; no reload used. Earlier new-game selection evidence may have been affected.
- [observed] The `carrier-small` named UI target resulted in a Venture/Tarsus/Shepherd fleet. Actual resulting fleet is authoritative; do not trust the target label without a screenshot.
- [observed] RDP readiness once reported an established socket while the client had a connection error. Restarting the existing user remote-desktop service and reconnecting restored input; do not turn this into a routine blind restart.
- [observed] Direct autopilot clipped Galatia's corona. Full trip consumed 38 supplies versus about 20 expected from maintenance alone; exact corona-only cost was not isolated. No reload.
- [observed] Low-memory warning appeared with 2 GB allocated. User says the warning alone is irrelevant. Preflight raised next-launch heap to 8 GB after clean save/stop; runtime benefit not yet measured.

## External advice awaiting verification

None yet.

## Candidate durable improvements

- Implemented: Byheart `session.mjs` pause/unpause/observe helper; verified pause and unpause in multiple live runs. Keep reviewed semantic boundary and evidence checks.
- Implemented: observation-only attachment in Preflight's Linux driver plus regression test. `mvn verify` passed. `capture.sh` compiled against the newly packaged engine and captured the unchanged paused March 31 game on Big Red; helper uses existing PID identity and reviewed driver actions.
- Candidate: catalog promotion for recurring pause/inspect/resume, using the actual distinct replay evidence.
- Candidate: input/capture composed flow with exact process identity and a fresh screenshot after each action. Keep contextual target selection outside deterministic replay.
- [observed] Main Byheart CLI teach/replay path remains browser-oriented. The campaign helper uses the existing game adapter and ReplayEngine directly; it does not fabricate a browser discovery trace or claim catalog promotion. Next useful integration is a supported game-run-directory entry point, if repeated campaign sessions justify it.

For each candidate, prefer a small record:

```text
problem:
repeated work:
proposed durable form:
verification:
status:
```

## Experiments / checkpoint branches

None yet.

A checkpoint branch should record the baseline, alternatives tried, outcome measures, and which branch became the continuing campaign. Do not turn ordinary play into constant rollback.
