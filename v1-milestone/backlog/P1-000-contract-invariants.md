---
id: P1-000
title: Freeze the behavioral invariants and protocol design
phase: 1
status: done
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

- [x] Every I1-I10 invariant has a corresponding normative CONTRACT section.
- [x] Every decision above has one selected design, rejected alternatives, and rationale.
- [x] No contract claims "oldest leader", exactly-once work, atomic LWW without tombstones, or atomic localStorage compare-and-set.
- [x] The contract separates normative guarantees from best-effort browser policies such as focus.
- [x] All Phase 1 implementation tasks cite the selected design and have compatible acceptance criteria.

## Files

`docs/CONTRACT.md` (new), `DECISIONS.md`, `v1-milestone/PLAN.md`,
`v1-milestone/FEATURE-COMPLETE.md`, and Phase 1 backlog wording if reconciliation is needed.

## Outcome

- Created `docs/CONTRACT.md` as the normative v1 design target and mapped every
  milestone invariant I1-I10 to a specific contract section.
- Selected exact identity/lifecycle states, bounded readiness and repair status,
  Web Lock names and fenced generations, HLC state operations and tombstones,
  atomic `setAll`, view claim results/TTL/authority, protocol major/revision envelope,
  payload/bookkeeping limits, storage failure timing, and artifact-first release rules.
- Recorded rejected alternatives and rationale for each design family, including why
  presence, raw timestamps, localStorage read/write, first-response sync, and timeout
  lock stealing cannot provide the v1 guarantees.
- Reconciled `DECISIONS.md` without deleting the historical `0.1.0` design and made
  the contract authoritative where the old algorithms differ.
- Updated FEATURE-COMPLETE to the selected semantics and made all eight downstream
  Phase 1 implementation/evidence tasks cite the applicable contract sections.
- No runtime behavior changed in this design-freeze task.
- Verified milestone validation, diff whitespace, and repository lint.
- Committed and pushed on `codex/v1-milestone-execution` as the P1-000 task commit.
- No unrelated working-tree changes were present when the task was completed.
