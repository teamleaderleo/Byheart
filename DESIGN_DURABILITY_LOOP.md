# Durable learning loop

Byheart should make the old manual Codex learning habit routine:

> do the task → notice what was learned → make the next attempt cheaper and more deterministic

The system should not require a ceremonial "teaching" phase when ordinary successful work already contains the useful evidence.

## Ratchet

After an accepted result, ask:

1. What did the agent have to rediscover?
2. Which part can be replayed exactly?
3. Which part can become a small helper, script, semantic action, recovery rule, or composed capability?
4. What must remain judgment because the situation is genuinely variable?
5. What evidence would prove the durable form works on the next attempt?

Prefer the strongest cheap representation that preserves the behavior:

```text
one-off reasoning
→ concise instruction / fact
→ helper or deterministic evaluator
→ Byheart capability
→ composed plan
→ semantic action / reflex
```

A long UI trace should not survive merely because it happened first. If Codex discovers that three stable commands or a small helper do the same job, the durable artifact should use those.

## Candidate, verify, promote

Successful work can create a **durability candidate**. A candidate records:

- the accepted task and result;
- the successful evidence/run ids;
- the proposed durable form;
- its inputs, outputs, and applicability;
- why it should be cheaper/easier next time;
- a verification recipe;
- current confidence and use count.

Candidates stay separate from trusted skills until they pass their verification recipe. Promotion should be easy, but an untested guess should not silently become the default path.

## What Codex should do

Codex should treat durability as part of finishing work, not as a separate user request. When a task required meaningful exploration or repeated clerical work and there is an obvious reusable improvement, create or update a candidate before considering the task fully settled.

Do not force a candidate when the task is genuinely unique or when the proposed abstraction would add more complexity than it removes.
