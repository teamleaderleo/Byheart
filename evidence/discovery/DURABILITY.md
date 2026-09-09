# Durability candidate: stage-supplies-order@1

Status: **candidate**

Find market ASH-17 and stage an order for 25 supplies. Stop at ORDER STAGED; do not submit a purchase.

## Current durable form

capability: The successful trace has already been compiled into deterministic replay. Verify it on distinct inputs, then keep it or collapse stable sub-work into a cheaper durable form.

Steps: 7; brittle point/selector targets: 0; unsuccessful discovery actions: 0.

Verification: 0/2 distinct successful invocations.

## Before calling this finished

- Can any part of the successful work be replaced by a smaller deterministic helper or command instead of preserving UI choreography?
- Are the capability inputs broad enough for the next real variation without hiding app-specific assumptions?
- What exact failure should send Codex back to exploration instead of retrying blindly?
- Consider whether this is already several meaningful skills composed in sequence instead of one monolithic capability.

If a smaller helper, script, semantic action, or instruction can replace part of the trace cleanly, prefer that and keep the evidence linking it back to the successful run.
