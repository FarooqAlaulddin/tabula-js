---
id: P2-001
title: Publish honest alternatives and product boundaries
phase: 2
status: done
depends_on: [P1-007]
owner: agent
scope: root positioning + source-verified alternatives
---

## Context

Tabula is a narrow coordination layer, not a universal synchronization library.
Users need to know both why its workspace bundle is useful and when a smaller or more
capable alternative is the correct choice.

## Task

- Add a concise alternatives section covering raw BroadcastChannel, Web Locks,
  `broadcast-channel`, SharedWorker, framework/store broadcast plugins, server fan-out,
  and a real collaborative-data engine.
- Verify current claims from primary documentation or the alternative's maintained
  documentation. Include a concrete case where every alternative is preferable.
- State Tabula's differentiator as the integrated same-origin model: typed ephemeral
  UI state, presence, leader identity/callbacks, atomic named views, and test adapters.
- Audit all examples and positioning for the non-goals: no persistence, CRDT, RPC,
  cross-origin/device, guaranteed focus, exactly-once work, or security authority.
- Explicitly classify document bodies such as Excalidraw scenes as unsafe for
  concurrent LWW editing unless one named view owns editing.

## Acceptance criteria

- [x] Every alternative includes a sourced capability statement and "use it instead when" guidance.
- [x] No comparison relies on an outdated feature claim or strawman.
- [x] Root positioning matches CONTRACT and the feature matrix exactly.
- [x] Excalidraw/draft examples no longer imply unsupported collaborative merge semantics.
- [x] The section remains concise enough to scan and links to detailed behavior docs.

## Files

Root README and example descriptions/docs that contain conflicting product claims.

## Outcome

- Added a source-linked comparison table for raw browser primitives, the maintained
  `broadcast-channel` package, SharedWorker, store plugins, server fan-out, and Yjs.
- Defined Tabula's integrated same-origin workspace model and a concrete case where
  each narrower or more capable alternative is preferable.
- Audited timing, persistence, security, and LWW claims across the root/package docs
  and demo copy; removed stale size claims pending the release size gate.
- Converted the Excalidraw example to one claimed editor with read-only mirrors so it
  demonstrates the documented LWW boundary instead of implying collaborative merge.
- Verified with React Doctor (no actionable findings), `pnpm lint`, `pnpm typecheck`,
  and `pnpm build`.
