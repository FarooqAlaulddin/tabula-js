---
id: P1-006
title: Harden lifecycle, tab identity, storage access, and bfcache recovery
phase: 1
status: todo
depends_on: [P1-005]
owner: agent
scope: coordinator lifecycle + identity/storage adapters + tests
---

## Context

Initialization can currently continue after destroy, opener detection can regenerate a
child tab id on every refresh, per-tab session epochs can invalidate another live tab's
view registry, and unconditional `pagehide` cleanup mishandles back/forward cache.
Storage access can also throw before Tabula produces an actionable error.

## Task

- Implement a small explicit lifecycle state machine covering initializing, ready,
  bfcache-suspended, and destroyed states.
- Cancel all initialization waits and queued work on destroy; settle `ready` according
  to CONTRACT; make post-destroy reads/mutations behave consistently.
- Give new top-level contexts fresh ids while preserving id across reload, including a
  child created by `window.open`; remove or redesign the unsafe per-tab epoch cleanup.
- Distinguish `pagehide.persisted` from termination and reconcile on persisted `pageshow`.
- Probe required local/session storage operations and translate blocked, unavailable,
  corrupt, or quota failures into CONTRACT-defined errors without partial startup.
- Clean all timers, listeners, lock requests, registry projections, and pending intents
  exactly once on terminal teardown.

## Acceptance criteria

- [ ] Destroy before/during/after ready is idempotent and leaves zero active resources.
- [ ] Initialization never reattaches work or resolves as usable after terminal destroy.
- [ ] Normal, opener-created, refreshed, duplicated, and bfcache-restored tab identities satisfy I1.
- [ ] A new independent tab cannot clear a live tab's view registry solely because its page session differs.
- [ ] bfcache leave/restore rejoins and repairs without duplicate presence or callbacks.
- [ ] Blocked storage and quota/corruption scenarios produce actionable, tested behavior.
- [ ] Unit tests and Chromium e2e lifecycle tests pass before downstream coordination rewrites begin.

## Files

Core coordinator/identity/registry code, lifecycle and regression unit tests, e2e
fixtures/specs, `docs/CONTRACT.md`, and `DECISIONS.md`.

## Outcome

(pending)
