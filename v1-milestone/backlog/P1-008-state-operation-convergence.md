---
id: P1-008
title: Make state set/delete operations convergent
phase: 1
status: todo
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

- [ ] Every permutation of the same set/delete operation set converges to the same result.
- [ ] A deleted key cannot reappear through delayed set, stale snapshot, late join, or clock rollback.
- [ ] Tombstones are synchronized but invisible through the value-facing public API.
- [ ] Listener, wildcard, keys, entries, and setAll semantics have direct unit coverage.
- [ ] Cyclic/cloneable values, non-cloneable values, `undefined`, and `DataCloneError` paths behave exactly as contracted.
- [ ] Prototype-dangerous and oversized keys remain governed by P1-005 validation.
- [ ] Existing state API tests plus new property/permutation tests pass.

## Files

Core state/protocol code, state and property tests, `docs/CONTRACT.md`, README/package
state guarantees, and `DECISIONS.md`.

## Outcome

(pending)
