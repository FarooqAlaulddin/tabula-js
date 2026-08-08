---
id: P1-002
title: Replace startup sync timing with a repairable handshake
phase: 1
status: todo
depends_on: [P1-008]
owner: agent
scope: discovery/sync state machine + repair loop + tests
---

## Context

The current first-response-or-150ms startup can permanently miss keys. The final
state operation model from P1-008 makes safe multi-responder merging possible, but
startup still needs correlated rounds, bounded completion, cohort handling, and
post-ready repair.

## Task

- Start sync only after the CONTRACT-defined presence discovery barrier.
- Include request id, requester generation, responder id, responder initialization
  state, and completion marker in validated sync traffic.
- Merge every valid response in a round using P1-008 operation ordering; do not trust
  arrival order or the first responder.
- Resolve a genuinely empty simultaneous-start cohort deterministically without
  deadlock and let a verified single tab become ready without full retry delay.
- Retry known-peer misses with bounded backoff. If the ready bound is reached, settle
  as CONTRACT defines, expose incomplete status, and repair on peer activity until a
  complete response arrives or peers are proven gone.
- Cancel requests/retries on destroy and bound all correlation records.

## Acceptance criteria

- [ ] A responder blocked beyond the old 150ms window still provides all values and tombstones.
- [ ] Divergent peers with disjoint/newer operations merge correctly regardless of response order.
- [ ] One tab and a simultaneous empty cohort settle ready without deadlock.
- [ ] Missed initial sync is observable and repairs keys/tombstones set before the requester joined.
- [ ] Destroy during every handshake stage leaves no retry, listener, warning, or ready continuation.
- [ ] Browser busy-loop, frozen-peer, resumed-peer, and late-response tests pass.
- [ ] README/package docs state a bounded ready contract and repair behavior without clock-time marketing promises.

## Files

Core coordinator/state sync path, state/coordinator unit tests, state e2e tests,
README/package docs, `docs/CONTRACT.md`, and `DECISIONS.md`.

## Outcome

(pending)
