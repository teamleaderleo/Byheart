# Continuous Starsector campaign

This is the default brief when Codex is asked to **play Starsector**, not merely exercise a benchmark.

## Objective

Start a fresh campaign yourself and play it as a continuing save.

Choose the new-game options, character/fleet direction, contracts, purchases, routes, fights, retreats, upgrades, and longer-term goals yourself. Learn the game as needed. Tooltips may stay on or be disabled if they stop helping. External guides and web research are allowed when useful.

The campaign is yours. Do not treat it as a sequence of maintainer-authored benchmark goals.

A good initial horizon is roughly 30 in-game days, then continue from the same save in later sessions unless the campaign is genuinely dead or a deliberate branch experiment calls for a checkpoint copy.

## Before touching the game

Read the current repository instructions in Byheart and Preflight.

In Preflight, start with:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `LLM_HANDOFF.md`
4. `docs/desktop-smoke-automation.md` — choose the operator route before launching or attaching
5. `docs/internal-game-control.md` — closed semantic game actions, receipts, pause/resume, save/checkpoint learning boundary

Preflight owns exact game/process/save mechanics. Byheart owns reusable procedures, evidence, capability composition, learning notes, and higher-level control.

## How to play

Use the strongest available observation and action boundary for the situation:

- visible UI / remote desktop for real clicking, map movement, menus, trading, refit, dialogs, and surfaces that are naturally visual;
- Preflight semantic actions where a reviewed game boundary already exists;
- screenshots plus structured game state together when possible;
- pause freely in campaign play before making decisions or when a situation becomes interesting.

Never interpret input delivery as success. Observe the result before choosing the next action.

Do not add an arbitrary reflection console or broad privileged game API just to make the current move easier. If a missing **read-only observation** or **reviewed semantic action** would repeatedly remove brittle work, it is reasonable to implement it with exact compatibility checks and tests.

## Continuous-save rule

Normal play advances the same agent-owned save.

Checkpoint copies are for deliberate experiments, comparisons, recovery from controller bugs, or evaluating alternative plans. A checkpoint experiment should return to the selected branch explicitly; it should not quietly erase campaign consequences.

Keep the normal campaign save separate from disposable test copies and record which one is active.

## Learn while playing

Maintain the files under `play/starsector/` as compact working memory.

Use these evidence tags when a claim needs provenance:

- `[observed]` — directly seen in this campaign or runtime
- `[guide]` — learned from an external guide/source and not yet independently checked
- `[hypothesis]` — plausible working rule that still needs evidence
- `[verified]` — held across repeated relevant observations/experiments

Do not turn the notes into a transcript. Record things that should affect later decisions.

## Durability pass

When a recurring task becomes familiar, make the next occurrence cheaper.

Possible durable forms include:

- a short instruction or fact in the playbook;
- a helper or deterministic calculator;
- a recovery rule;
- a reviewed Preflight semantic action;
- a Byheart capability for repeated UI work;
- a composed plan;
- a policy/heuristic backed by multiple outcomes.

Prefer the smallest durable form that actually saves work. If three commands replace twenty exploratory steps, keep the three commands. If a model decision remains genuinely contextual, keep it as a decision.

## Research is part of play

You may look up mechanics, guides, builds, economy advice, faction information, or mod/version details. Record only useful conclusions and source context. Treat version/mod-specific advice as uncertain until it matches the installed game.

The point is not to prove the model already knows Starsector. The point is to see whether a capable agent can acquire competence, keep a continuous campaign alive, and progressively reduce repeated reasoning and UI rediscovery.

## Stop conditions

Keep playing until one of these is true:

- the requested play horizon is reached;
- the campaign is irrecoverably dead and a fresh start is justified;
- game control is blocked by a missing capability that cannot be repaired safely in the session;
- a human decision is explicitly required;
- the environment itself is unavailable.

When stopping, leave `play/starsector/CAMPAIGN.md` with a clear next action so another Codex session can continue the same save.