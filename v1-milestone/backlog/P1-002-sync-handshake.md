---
id: P1-002
title: Replace startup sync timing with a repairable handshake
phase: 1
status: done
depends_on: [P1-008]
owner: agent
scope: discovery/sync state machine + repair loop + tests
---

## Context

The current first-response-or-150ms startup can permanently miss keys. The final
state operation model from P1-008 makes safe multi-responder merging possible, but
startup still needs correlated rounds, bounded completion, cohort handling, and
post-ready repair.

Implement against `docs/CONTRACT.md` sections 3.2 and 6.6; bounded ready with
pending/repairing/complete status and correlated multi-responder rounds are authoritative.

## Task

- Start sync only after the CONTRACT-defined presence discovery barrier.
- Include request id, requester generation, responder id, responder initialization
  state, and completion marker in validated sync traffic.
- Merge every valid response in a round using P1-008 operation ordering; do not trust
  arrival order or the first responder.
- Resolve a genuinely empty simultaneous-start cohort deterministically without
  deadlock and let a verified single tab become ready without full retry delay.
- Retry known-peer misses with bounded backoff. If the ready bound is reached, resolve
  ready with `repairing` status, emit `sync:status`, and repair on peer activity until a
  complete response arrives or peers are proven gone.
- Cancel requests/retries on destroy and bound all correlation records.

## Acceptance criteria

- [x] A responder blocked beyond the old 150ms window still provides all values and tombstones.
- [x] Divergent peers with disjoint/newer operations merge correctly regardless of response order.
- [x] One tab and a simultaneous empty cohort settle ready without deadlock.
- [x] Missed initial sync is observable and repairs keys/tombstones set before the requester joined.
- [x] Destroy during every handshake stage leaves no retry, listener, warning, or ready continuation.
- [x] Browser busy-loop, frozen-peer, resumed-peer, and late-response tests pass.
- [x] README/package docs state a bounded ready contract and repair behavior without clock-time marketing promises.

## Files

Core coordinator/state sync path, state/coordinator unit tests, state e2e tests,
README/package docs, `docs/CONTRACT.md`, and `DECISIONS.md`.

## Outcome

Replaced the first-response timer with generation-scoped synchronization rounds. Modern
requests carry request id, requester instance/generation, known peers, and protocol
revision. Directed responses echo the correlation and include responder tab/document
identity, initialization state, `complete: true`, and a complete operation snapshot.
Revision-0 null requests and bare snapshots remain readable.

The coordinator now discovers live stored presence before synchronization, merges every
valid retained response through P1-008 ordering, and requires one round covering every
currently live peer. A verified singleton skips redundant retries. A simultaneous empty
cohort deterministically lets its lowest document instance bootstrap readiness, after
which peers receive a ready response without circular waiting.

Known-peer misses retry with exponential backoff capped at one second. When the total
ready budget expires, the workspace becomes usable with `repairing` status and sorted
`missingPeerIds`; peer activity, late responses, retries, and presence removal can move
it to `complete`. Sixteen recent correlations retain bounded late-response repair.
Destroy, identity restart, and bfcache suspension cancel timers, waiters, and records;
suspended workspaces do not answer sync requests until resumed.

Evidence:

- `pnpm test`: 235 tests passed, including delayed original correlation, both divergent
  responder orders, empty-cohort bootstrap, late value/tombstone repair, peer removal,
  bounded-ready status, and post-ready retry teardown.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed.
- Full Chromium suite: 40 tests passed. Browser evidence covers a retained response
  delayed past readiness, a blocked responder event loop, a persisted suspended/resumed
  responder, tombstones, refresh, identity, presence, leadership, and view regressions.
- `node v1-milestone/validate.mjs`: passed after plan synchronization.

Updated the fixture to accept `readyTimeout`, exported the typed correlation payloads,
and reconciled the normative contract, decision log, root README, and package README.
