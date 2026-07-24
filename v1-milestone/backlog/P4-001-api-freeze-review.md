---
id: P4-001
title: API freeze review
phase: 4
status: todo
depends_on: [P1-001, P1-002, P1-005, P2-001, P3-001]
owner: agent
scope: 1 review pass over ~8 interfaces + fixes
---

## Context

After 1.0.0, every rename or signature change is a major version. The exported surface is small (Workspace, WorkspaceState, WorkspaceViews, WorkspaceTabs, ViewHandle, TabMeta, WorkspaceOptions, event map + createWorkspace/testing exports) — review it once, deliberately, while changes are still cheap.

## Task

Review every exported symbol in `packages/tabula/src/index.ts`, `tabula.ts`, `testing.ts`, and `tabula-react/src/index.ts` against these checks:

- **Naming consistency**: claim/release/open/focus verbs; `on`/`off` symmetry (state has `on` but no `off` — decide: add `state.off` or document unsubscribe-function-only pattern and make Workspace consistent by removing `off`? Pick one convention everywhere).
- **Option defaults**: are `heartbeat: 1500` / `timeout: 5000` right as defaults post-P1-001 (leadership no longer depends on them)? Is `session: true` the right default?
- **Type ergonomics**: does `useSharedState<AppState, 'draft'>('draft')` (key stated twice) have a cleaner signature? Evaluate `useSharedState<AppState>('draft')` with inference.
- **`@internal` hygiene**: nothing exported that isn't documented; everything documented is exported.
- **Error messages**: every throw states what to do, not just what failed.
- **Support policy**: declare and record the supported ranges — Node (for `tabula/testing`), TypeScript (test emitted declarations against the declared minimum and latest), React peer range. Add `peerDependencies`/`engines` fields as decided; these become part of the frozen contract.

Produce a short decision log (append to this file's Outcome), implement the accepted changes, and update README/API reference in the same commit.

## Acceptance criteria

- [ ] Decision log in Outcome: every check above has a recorded keep/change decision.
- [ ] Accepted changes implemented; `pnpm build && pnpm typecheck && pnpm test && pnpm test:e2e` green.
- [ ] README API reference matches the frozen surface exactly.

## Files

`packages/tabula/src/*.ts`, `packages/tabula-react/src/index.ts`, `README.md`.

## Outcome

(pending)
