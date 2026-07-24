---
id: P1-001
title: Rebuild leader election on Web Locks
phase: 1
status: todo
depends_on: [P0-002, P0-003]
owner: agent
scope: 1 module + unit tests + 2 e2e specs
---

## Context

Leadership is currently derived from presence: oldest tab by self-reported `createdAt`, heartbeats in localStorage, prune windows, wake-up reconciliation. `navigator.locks.request()` gives browser-guaranteed mutual exclusion with automatic failover and zero timers, and is available in the exact baseline Tabula already requires (Chrome 92+/Safari 15.4+/Firefox 96+ — matches the crypto.randomUUID floor).

Design review flagged two protocol holes any implementation must close: (1) `leader:change` broadcasts are transient, so a tab that joins *after* the leader acquired the lock never hears it — followers need a discovery path; (2) a queued lock request outlives `destroy()` unless explicitly aborted, so a destroyed tab could acquire leadership after teardown.

## Task

Replace the election mechanism, keep the observable API identical:

- Each tab requests `tabula:<namespace>:leader` as an exclusive Web Lock, holding an open promise while leading. Lock holder = leader; the browser queues the rest and hands over on close/crash automatically.
- **Abortable request**: pass an `AbortController` signal to `locks.request`; `destroy()` aborts a queued request and resolves the held promise if leading.
- **Leader discovery for late joiners**: on acquiring the lock, broadcast `leader:change` AND answer each subsequent `tab:announce` with leader identity (directed message or included in the announce-response), so `tabs.leader()` is correct for tabs that join later. Never leave `tabs.leader()` permanently null while a lock holder exists.
- `isLeader()`, `onLeader()` setup/cleanup, `tabs.leader()`, and `leader:change` must behave exactly as documented in the README.
- Presence heartbeats stay — they still serve `tab:join`/`tab:leave`, view vacancy cleanup, and `tabs.list()`. Remove only the leadership-recalculation-from-presence path.
- `tabula/testing` cluster: keep the deterministic oldest-tab rule in the mock (Node has no Web Locks); document the divergence in testing.ts.
- If `navigator.locks` is missing, throw the same style of descriptive error as the BroadcastChannel check — no silent fallback.

Update DECISIONS.md Leader section and README leader prose: crash handoff is now browser-immediate; revise the Guarantees table row accordingly.

## Acceptance criteria

- [ ] Unit tests adapted (behavior-asserting tests unchanged) — all green.
- [ ] e2e: leader killed via `page.close()` — new leader elected without waiting a presence timeout.
- [ ] e2e: tab joining after leadership settled reports the correct `tabs.leader()`.
- [ ] e2e: `destroy()` while queued for the lock — tab never becomes leader afterward.
- [ ] Existing `onLeader` cleanup + refresh specs pass unmodified.
- [ ] `pnpm test && pnpm test:e2e` fully green.
- [ ] README + DECISIONS.md updated in the same commit.

## Files

`packages/tabula/src/tabula.ts` (Leader module + capability check), `packages/tabula/src/testing.ts` (doc comment), `packages/tabula/src/__tests__/leader.test.ts`, `e2e/tests/leader.spec.ts`, `README.md`, `DECISIONS.md`.

## Outcome

(pending)
