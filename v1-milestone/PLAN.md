# Tabula → 1.0.0 Master Plan

Goal: take Tabula from `0.1.0` (feature-complete, unpublished, unhardened) to a published, battle-tested `1.0.0`.

## How to use this backlog (for agents)

- Every action item is one file in `backlog/`, named `P<phase>-<seq>-<slug>.md`.
- **Frontmatter `depends_on` is authoritative.** The graph and index below are conveniences; if they ever disagree with frontmatter, frontmatter wins.
- Pick the next task by: `status: todo`, all `depends_on` ids have `status: done`, lowest phase, then lowest seq. **If the selected task is `owner: human`**: prepare its inputs if the task text allows, record them in its `## Outcome`, then reselect ignoring all `owner: human` tasks until the maintainer changes their status.
- When you start a task, set `status: in-progress`. When finished and acceptance criteria verified, set `status: done` and fill in `## Outcome`. If blocked, set `status: blocked` and record why.
- Never skip acceptance criteria. Each is checkable by command or inspection; if you find one that isn't, fix the criterion first and note it in `## Outcome`.
- Update nothing outside the task's `## Files` scope without recording it in `## Outcome`.

## Phases

| Phase | Name | Gate to pass |
|-------|------|--------------|
| 0 | Identity & hygiene | Package renamed to an npm-available name; pending work committed; metadata complete; CI green |
| 1 | Hardening | Web Locks leadership + sync handshake merged; message robustness reviewed; Firefox/WebKit in CI; edge-case suite green |
| 2 | Positioning & docs | Comparisons section shipped; live demo deployed; behavior doc published |
| 3 | Release engineering | Changesets adopted; publish workflow dry-run verified; size/exports gate in CI |
| 4 | 0.2.0 launch | API freeze review done; 0.2.0 on npm with provenance |
| 5 | Burn-in → 1.0.0 | Burn-in evidence criteria met (see P5-002); 1.0.0 published |

Phases 1, 2, and 3 can run in parallel after Phase 0 (except where frontmatter says otherwise).

## Dependency graph (generated from frontmatter — regenerate on change)

```
P0-001 (human) ──┐
P0-003 ──────────┼─→ P0-002 ─→ { P1-001, P1-002, P1-004, P1-005, P2-002, P3-002, P3-003 }
P0-003 ─→ P0-004 ─────────────────────────────→ P3-001 (also needs P3-002)
P1-001 ─→ P2-001
P1-001 + P1-002 + P1-004 ─→ P1-003 ─→ P2-003
P1-001 + P1-002 + P1-005 + P2-001 + P3-001 ─→ P4-001
P4-001 + P1-003 + P1-004 + P2-002 + P2-003 + P3-003 ─→ P4-002 (human)
P4-002 ─→ P5-001 (human) ─→ P5-002 (human)
```

## Non-goals for 1.0

Unchanged from DECISIONS.md: no persistence, no CRDT/merge strategies, no cross-origin, no iframes, no RPC, no polyfills. Scope creep into any of these is grounds for rejecting a task, not extending it.

## Standing rules

- Every behavior change lands with unit tests and, where observable in a browser, an e2e spec.
- README code samples must stay executable against the real API — verify against `packages/tabula/src/tabula.ts` exports before committing doc changes.
- Once P3-002 lands: every user-facing change includes a changeset in the same commit/PR.
- No task estimates in clock time anywhere in this backlog; effort is expressed as scope (files, steps).
- Conventional commits; each task = one commit (or one PR) referencing its task id. Verify the working tree is clean of *other* tasks' changes before starting.

## Index

Titles are verbatim copies of task frontmatter — keep in sync when statuses change.

| ID | Title | Owner | Status |
|----|-------|-------|--------|
| P0-001 | Choose the npm package name | human | todo |
| P0-002 | Rename packages and all references | agent | todo |
| P0-003 | Commit pending e2e work | agent | todo |
| P0-004 | Complete package metadata for publishing | agent | todo |
| P1-001 | Rebuild leader election on Web Locks | agent | todo |
| P1-002 | Replace the 150ms sync window with a handshake | agent | todo |
| P1-003 | Edge-case e2e — throttling, suspension, teardown races | agent | todo |
| P1-004 | Browser test matrix — Firefox and WebKit | agent | todo |
| P1-005 | Inbound message robustness and trust-model review | agent | todo |
| P2-001 | Add honest comparisons section to README | agent | todo |
| P2-002 | Deploy live demo | agent | todo |
| P2-003 | Write docs/BEHAVIOR.md — observed behavior under browser adversity | agent | todo |
| P3-001 | Release workflow — changesets publish with npm provenance | agent | todo |
| P3-002 | Adopt changesets and seed CHANGELOG | agent | todo |
| P3-003 | Bundle size and exports regression gate | agent | todo |
| P4-001 | API freeze review | agent | todo |
| P4-002 | Publish 0.2.0 | human | todo |
| P5-001 | Dogfood in a real app | human | todo |
| P5-002 | 1.0.0 gate and release | human | todo |
