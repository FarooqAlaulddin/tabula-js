---
id: P1-000
title: Freeze the behavioral invariants and protocol design
phase: 1
status: todo
depends_on: [P0-002, P0-004]
owner: agent
scope: contract/design documents; no behavior implementation
---

## Context

The original implementation mixed product contracts with incidental algorithms such
as "oldest tab wins", per-tab epochs, unconditional deletes, and localStorage
read-then-write claims. Before replacing those algorithms, 1.0 needs implementation-
independent invariants and one final message/ownership design.

## Task

Create `docs/CONTRACT.md` and reconcile DECISIONS.md with PLAN invariants I1-I10.
Record explicit decisions for:

- Tab identity across normal open, `window.open`, reload, duplicate, bfcache, and close.
- Lifecycle states and the behavior of public calls before ready and after destroy.
- The state operation total order, tombstone retention, `setAll` atomicity, supported
  structured-clone value domain, `undefined`, and outbound clone/send failure behavior.
- Web Lock names, leader identity discovery, frozen-holder behavior, and test-model divergence.
- View exclusion authority, claim token/fencing rules, release authority, pending-open TTL,
  protocol-based state handoff, refresh behavior, and whether a tab may own more than one view.
- Protocol envelope/version compatibility, payload limits, mismatch signaling, and rollout policy.
- Required storage capabilities and whether failures throw at creation or at feature use.
- Public support floors and which guarantees are eventual rather than immediate.

Update FEATURE-COMPLETE wording if any decision changes a row. Do not implement the
decisions in this task.

## Acceptance criteria

- [ ] Every I1-I10 invariant has a corresponding normative CONTRACT section.
- [ ] Every decision above has one selected design, rejected alternatives, and rationale.
- [ ] No contract claims "oldest leader", exactly-once work, atomic LWW without tombstones, or atomic localStorage compare-and-set.
- [ ] The contract separates normative guarantees from best-effort browser policies such as focus.
- [ ] All Phase 1 implementation tasks cite the selected design and have compatible acceptance criteria.

## Files

`docs/CONTRACT.md` (new), `DECISIONS.md`, `v1-milestone/PLAN.md`,
`v1-milestone/FEATURE-COMPLETE.md`, and Phase 1 backlog wording if reconciliation is needed.

## Outcome

(pending)
