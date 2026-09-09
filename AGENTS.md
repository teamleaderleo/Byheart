# Repository instructions

Byheart is both a computer-use take-home project and a longer-lived research project.

Before changing code:

1. Read `README.md`, `CODEX.md`, `ARCHITECTURE.md`, and `TAKEHOME.md`.
2. Preserve the distinction between reasoning-time discovery and deterministic replay.
3. Prefer Codex/external-agent discovery through the resident Byheart bridge. A provider API is an optional adapter, not a project requirement.
4. Keep the core surface-agnostic; browser/game/remote-desktop details belong in adapters.
5. Treat action delivery and verified effect as separate facts.
6. Preserve the four replay outcomes: success, known outcome, failure, intervention required.
7. Keep secrets and raw sensitive data out of artifacts, evidence, tests, and commits.
8. Run `npm test` for core changes.
9. Keep `REPORT.md` under the seven exact assignment headings.

When teaching a browser workflow from Codex, use the `teach` bridge in `CODEX.md` and send the successful actions through that bridge. Do not drive a second private browser instance and then fabricate the trace afterward.

For Starsector, treat Preflight's repository protocol as authoritative. Byheart may compose reviewed semantic actions and visual interaction, but should not grow an arbitrary game-reflection console.

Prefer a working end-to-end slice over broad half-implementations. Ambitious experiments belong behind clean seams once the core path remains runnable.
