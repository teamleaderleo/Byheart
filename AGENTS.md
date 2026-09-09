# Repository instructions

Byheart is both a computer-use take-home project and a longer-lived research project.

Before changing code:

1. Read `README.md`, `ARCHITECTURE.md`, and `TAKEHOME.md`.
2. Preserve the distinction between model discovery and deterministic replay.
3. Keep the core surface-agnostic; browser/game/remote-desktop details belong in adapters.
4. Treat delivery and verified effect as separate facts.
5. Preserve the four run outcomes: success, known outcome, failure, intervention required.
6. Keep secrets and raw sensitive data out of artifacts, evidence, tests, and commits.
7. Run `npm test` for core changes.
8. Keep `REPORT.md` under the seven exact assignment headings.

Prefer a working end-to-end slice over broad half-implementations. Ambitious experiments belong behind clean seams once the core path remains runnable.
