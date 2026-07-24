---
id: P1-002
title: Replace the 150ms sync window with a handshake
phase: 1
status: todo
depends_on: [P0-002]
owner: agent
scope: state-sync path + unit tests + 1 e2e spec
---

## Context

A new tab broadcasts `state:sync-request` and accepts the first `state:sync` response within 150ms, else starts empty. If every other tab is throttled/busy past the window, the new tab silently begins with empty state.

Design review flagged three holes a naive fix would keep: (1) a brand-new tab's presence map initially contains only itself, so "no peers → resolve immediately" recreates the race — a throttled existing tab is invisible until discovery completes; (2) if only-initialized-tabs-respond is the rule, a cohort of simultaneously initializing tabs can deadlock into all-empty; (3) late convergence "via subsequent messages" never syncs keys that existing tabs set before the new tab joined and never touch again.

## Task

Make initial sync robust without letting startup hang:

- **Discovery barrier first**: resolve "am I alone?" from presence discovery (announce + response round), not from the initial presence map. Only a tab that completed discovery and saw no peers may resolve `ready` as a fresh workspace.
- **Correlated, merged responses**: sync-requests carry a request id; collect ALL responses arriving within the round (not just the first) and merge by LWW — different peers may hold different keys if a previous sync was partial.
- Retry the request with backoff (e.g. 0/150/450/1050ms) while peers are known to exist and no complete response arrived.
- **Cohort tiebreak**: tabs that haven't completed init respond with an explicit "initializing" marker rather than staying silent, so a cohort can detect the all-new case and resolve empty deterministically instead of deadlocking.
- **Post-ready repair**: if peers existed but no response arrived by the final attempt, resolve `ready` (documented), mark sync incomplete, and re-request on the next peer heartbeat/announce until a full sync lands. Emit a dev-observable signal (console.warn in dev or internal flag) — never silent.
- Keep `await app.ready` as the single contract; no new config knobs unless unavoidable.

Update README Guarantees table "New-tab sync" row and DECISIONS.md State section.

## Acceptance criteria

- [ ] Unit: new tab joining a cluster with a responder delayed >150ms still receives full state.
- [ ] Unit: two tabs starting simultaneously in an empty workspace both resolve `ready` (no deadlock).
- [ ] Unit: first-and-only tab resolves `ready` after discovery round without long waits.
- [ ] Unit: post-ready repair — tab that missed sync converges after a peer's next heartbeat, including keys set before it joined.
- [ ] e2e: tab A sets state, tab B opens while A is blocked ~500ms (busy loop) — B converges to A's full state.
- [ ] `pnpm test && pnpm test:e2e` fully green.
- [ ] README + DECISIONS.md updated in the same commit.

## Files

`packages/tabula/src/tabula.ts` (State/Coordinator sync path), `packages/tabula/src/__tests__/state.test.ts`, `packages/tabula/src/__tests__/coordinator.test.ts`, `e2e/tests/state.spec.ts`, `README.md`, `DECISIONS.md`.

## Outcome

(pending)
