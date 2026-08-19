---
id: P1-008
title: Make state set/delete operations convergent
phase: 1
status: done
depends_on: [P1-001]
owner: agent
scope: state operation model + ordering + tests
---

## Context

Current sets carry ordering metadata, but deletes are unversioned and leave no
tombstone. Delayed sets or sync snapshots can therefore resurrect deleted values.
Wall-clock rollback and same-millisecond operations also need one documented total
order before the handshake can merge multiple responders correctly.

Implement against `docs/CONTRACT.md` section 6; its hybrid logical clock tuple,
tombstone lifetime, transactional send, value limits, and batch semantics are authoritative.

## Task

- Represent set and delete as the CONTRACT hybrid-logical-clock operation shape.
- Retain tombstones for the life of the live workspace cohort so snapshots and delayed
  messages cannot resurrect deleted keys. Tombstones are not returned by public
  `keys()`/`entries()`/`get()`.
- Implement one deterministic total order that survives duplicate, reordered,
  same-millisecond, and clock-rollback scenarios documented by CONTRACT.
- Implement `setAll` as one atomic batch: install every winning entry before ordered
  key/wildcard notifications and commit nothing when validation/clone/send fails.
- Enforce the CONTRACT-selected structured-clone value domain and `undefined`
  semantics. A clone/send failure must not leave an unbroadcast local winner or emit
  a misleading change notification.
- Ensure listeners receive one effective change per accepted winning operation and do
  not fire for rejected stale/duplicate operations.
- Bound retained per-key metadata without weakening delete convergence while peers live.

## Acceptance criteria

- [x] Every permutation of the same set/delete operation set converges to the same result.
- [x] A deleted key cannot reappear through delayed set, stale snapshot, late join, or clock rollback.
- [x] Tombstones are synchronized but invisible through the value-facing public API.
- [x] Listener, wildcard, keys, entries, and setAll semantics have direct unit coverage.
- [x] Cyclic/cloneable values, non-cloneable values, `undefined`, and `DataCloneError` paths behave exactly as contracted.
- [x] Prototype-dangerous and oversized keys remain governed by P1-005 validation.
- [x] Existing state API tests plus new property/permutation tests pass.

## Files

Core state/protocol code, state and property tests, `docs/CONTRACT.md`, README/package
state guarantees, and `DECISIONS.md`.

## Outcome

Replaced timestamp/version entries with typed set/delete operations carrying an HLC,
tab/document actor, and random operation id. The comparison tuple follows the contract
exactly and uses locale-independent code-unit string ordering. Local HLC state survives
clock rollback and advances from accepted remote clocks.

Deletes now install cohort-lifetime tombstones. Snapshots include tombstones while
`get`, `keys`, `entries`, and pending-open value selection hide them. The 1,024-key cap
includes tombstones and local overflow fails before broadcast.

Local set values are safety-budget checked and structured-cloned before operation
creation. The complete outbound operation must send before local commit or notification;
`undefined`, non-cloneable values, transfer-only values, oversized payloads, and send
failure leave no local winner. Added `structuredClone()` to synchronous capability checks.

`setAll` now sends one `state:batch`. All values and the aggregate message are validated
before send, all winning operations install before callbacks, key listeners run in
lexical order, then wildcard listeners run in the same order. Remote batches use the
same atomic observation semantics.

Evidence:

- `pnpm test`: 226 tests passed. State tests exhaust all 24 permutations of a mixed
  set/delete operation set and directly cover HLC rollback/receive, tie breakers,
  tombstones, duplicate/stale suppression, clone/send failure, bounds, and batches.
- Protocol tests accept the fenced operation, tombstone, sync, and batch shapes and
  reject malformed tombstones, undefined sets, and duplicate batch keys.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed.
- Full Chromium suite: 37 tests passed, including delayed replay after delete,
  tombstone late-join sync, atomic batch callback observation, cyclic values, and
  transactional transfer-only failure.
- `node v1-milestone/validate.mjs`: passed after plan synchronization.

Expanded the listed scope to public operation type exports, runtime capability checks,
the shared test channel helper, browser state tests, and milestone index. These files
are required to expose and verify the contracted operation model end to end.
