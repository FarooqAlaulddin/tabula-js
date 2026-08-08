---
id: P1-006
title: Harden lifecycle, tab identity, storage access, and bfcache recovery
phase: 1
status: done
depends_on: [P1-005]
owner: agent
scope: coordinator lifecycle + identity/storage adapters + tests
---

## Context

Initialization can currently continue after destroy, opener detection can regenerate a
child tab id on every refresh, per-tab session epochs can invalidate another live tab's
view registry, and unconditional `pagehide` cleanup mishandles back/forward cache.
Storage access can also throw before Tabula produces an actionable error.

Implement against `docs/CONTRACT.md` sections 3 and 9; the lifecycle/status states,
duplicate-id repair, bfcache behavior, and capability failure timing are authoritative.

## Task

- Implement the explicit initializing, ready, bfcache-suspended, failed, and destroyed
  lifecycle states plus pending/repairing/complete sync status.
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

- [x] Destroy before/during/after ready is idempotent and leaves zero active resources.
- [x] Initialization never reattaches work or resolves as usable after terminal destroy.
- [x] Normal, opener-created, refreshed, duplicated, and bfcache-restored tab identities satisfy I1.
- [x] A new independent tab cannot clear a live tab's view registry solely because its page session differs.
- [x] bfcache leave/restore rejoins and repairs without duplicate presence or callbacks.
- [x] Blocked storage and quota/corruption scenarios produce actionable, tested behavior.
- [x] Unit tests and Chromium e2e lifecycle tests pass before downstream coordination rewrites begin.

## Files

Core coordinator/identity/registry code, lifecycle and regression unit tests, e2e
fixtures/specs, `docs/CONTRACT.md`, and `DECISIONS.md`.

## Outcome

Implemented an abortable coordinator lifecycle with immutable status snapshots,
terminal typed errors, ordered pre-ready/suspension queues, one total configurable
readiness budget, and idempotent terminal cleanup. Persisted page transitions now
suspend and resume the same workspace; ordinary pagehide still performs graceful
terminal teardown.

Tab identity now combines a reload-stable session candidate with a document instance
id and deterministic duplicate probing. The later claimant repairs before presence,
including opener-created and duplicated tabs, and the unsafe cross-session registry
sweep is no longer called. Removed the obsolete public `session` option.

Added synchronous secure-context/Web Locks/BroadcastChannel/UUID/storage capability
checks, typed runtime storage errors, transactional claim/open writes, and bounded
quarantine diagnostics for corrupt projections. Added identity messages to the
validated protocol.

Evidence:

- `pnpm test`: 229 tests passed, including 13 lifecycle/capability tests and a
  connected duplicate-identity integration test.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed.
- Full Chromium suite: 29 tests passed, including opener identity repair across
  refresh, duplicated-session repair, and persisted bfcache suspend/resume.
- `node v1-milestone/validate.mjs`: passed after status updates.

Expanded the listed file scope to `runtime.ts`, public exports/READMEs, the protocol
validator/tests, e2e fixture/spec, and `DECISIONS.md`; these are required to expose,
validate, document, and record the lifecycle and identity contract implemented here.
