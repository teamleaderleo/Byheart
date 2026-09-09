# Byheart

**Teach a computer a task once; let it remember how.**

Byheart is an experiment in turning successful computer-use behavior into reusable capabilities.

A capable model can explore an unfamiliar interface, accomplish a goal, and leave behind something more durable than a transcript: a typed, reviewable skill with inputs, outputs, checkpoints, evidence, and a deterministic execution path.

```text
goal
  ↓
observe → decide → act
  ↓
successful run
  ↓
compile the useful behavior
  ↓
reusable capability
  ↓
replay / invoke / compose
```

The working idea extends beyond browser automation. A surface may be a web page, native desktop app, remote desktop, game, VM, accessibility tree, screenshot stream, or a semantic adapter embedded in the target itself.

The long-term question is broader:

> How much of an agent's successful experience can become executable knowledge?

## Current directions

- computer-use discovery followed by deterministic replay;
- capability artifacts with preconditions, parameters, outputs, checkpoints, evidence, and versioning;
- browser, desktop, remote-desktop, and game-control adapters;
- human takeover of the same live session when a run needs judgment;
- stronger models teaching procedures that cheaper models or deterministic executors can later invoke;
- Starsector as a rich campaign-planning and UI-automation laboratory;
- Battle Brothers as a turn-based tactical and long-horizon planning laboratory;
- using checkpointed runs to compare plans and retain successful behavior;
- a take-home project as the first thin end-to-end implementation.

See [NOTES.md](NOTES.md) for the current idea pile and [TAKEHOME.md](TAKEHOME.md) for the interview-project slice.
