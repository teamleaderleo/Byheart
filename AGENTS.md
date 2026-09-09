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

## Durability pass

Treat “make the next attempt easier” as part of finishing meaningful work.

After a successful task that required exploration, repeated clerical steps, a repair, or a non-obvious sequence, spend a short pass asking what should become durable. Prefer the cheapest strong representation: a concise instruction/fact, helper, script, recovery rule, semantic action, Byheart capability, or composed plan. Do not preserve a long UI trace when a smaller deterministic helper does the same job.

If the durable improvement is obvious and cheap, implement it before considering the task settled. If it needs evidence first, leave a durability candidate with an exact verification recipe. Do not force this ceremony onto genuinely one-off tasks or create abstractions that cost more than they save.

When a Byheart `teach` run succeeds, use its automatically emitted sibling `*.candidate.json`. Distinct successful replays verify the candidate. A verified candidate can be promoted with `byheart promote`, which creates a repository-local skill wrapper under `.byheart/skills/`. Before rediscovering a familiar procedure, inspect `.byheart/skills/index.json` when present.

When teaching a browser workflow from Codex, use the `teach` bridge in `CODEX.md` and send the successful actions through that bridge. Do not drive a second private browser instance and then fabricate the trace afterward.

## Starsector play

For Starsector, treat Preflight's repository protocol as authoritative. Byheart may compose reviewed semantic actions and visual interaction, but should not grow an arbitrary game-reflection console.

If the task is to **play Starsector**, read [`STARSSECTOR_PLAY.md`](STARSSECTOR_PLAY.md). The default experiment is a self-directed continuing campaign: Codex starts its own save, makes its own game decisions, learns from tooltips/guides/runtime evidence, keeps compact working memory under `play/starsector/`, and progressively makes recurring work easier. Prepared benchmark scenarios are supporting tools, not the campaign objective.

Prefer a working end-to-end slice over broad half-implementations. Ambitious experiments belong behind clean seams once the core path remains runnable.
