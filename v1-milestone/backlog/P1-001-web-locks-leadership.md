---
id: P1-001
title: Rebuild leadership on Web Locks
phase: 1
status: done
depends_on: [P1-006]
owner: agent
scope: leader authority + identity projection + unit/browser tests
---

## Context

Presence-derived "oldest tab" leadership can split during throttling and suspension.
The 1.0 contract instead uses an exclusive Web Lock as the sole authority. This is a
semantic correction: request order is browser-controlled, and leadership is not an
exactly-once execution service.

Implement against `docs/CONTRACT.md` section 5; the exact lock name, persistent
generation, projection rules, and frozen-holder boundary are authoritative.

## Task

- Request and hold the CONTRACT-defined workspace lock through an unresolved promise.
- Use one AbortController for queued acquisition and a separate explicit release path
  for a held lock. Destroy must handle both without unhandled promise rejection.
- Run `onLeader` setup only inside the held-lock interval and cleanup exactly once
  before voluntary release. Closing/crashing terminates the holder; no follower may
  run setup before it actually acquires the lock.
- Increment the persistent leader generation while holding the lock and project holder
  identity through versioned protocol messages. Answer late joiners, recover after
  missed announcements, reject stale generations, and keep
  `tabs.leader()` eventually accurate without making it an authority.
- Throw a descriptive capability error when Web Locks or a secure context is absent.
- Keep the test cluster deterministic, but document that its oldest-created choice is
  a simulation and not a browser ordering guarantee.

## Acceptance criteria

- [x] Browser instrumentation proves no overlap between active leader callback intervals across 8 contending tabs.
- [x] Close, crash, destroy-while-queued, destroy-while-held, refresh, and late-join transfer/discovery tests pass.
- [x] Cleanup is directly observed exactly once on voluntary demotion/destroy; replacement setup is separately observed.
- [x] Stale/delayed leader messages cannot overwrite a newer lock-holder generation.
- [x] A frozen holder's behavior is tested/documented without falsely promising failover while the lock remains held.
- [x] Missing Web Locks/insecure context errors state the prerequisite and recovery.
- [x] Core and testing-subpath leader APIs retain the CONTRACT-selected observable shape.

## Files

Core leader/coordinator code, testing adapter comments/behavior, leader unit/e2e tests,
README/package docs, `docs/CONTRACT.md`, and `DECISIONS.md`.

## Outcome

Replaced presence-derived ordering with one held exclusive Web Lock named exactly
`tabula-js:v1:<encoded-workspace-namespace>:leader`. Queued acquisition has an abort
controller; held acquisition has an independent release promise. Coordinator teardown,
identity repair, and bfcache suspension stop leader callbacks before releasing the lock.

Each acquisition increments a validated localStorage generation while inside the lock
and publishes `{generation, tabId, instanceId}`. Added `leader:query` for late discovery;
fenced projections reject lower generations, same-generation conflicts, and legacy
unfenced authority. Corrupt generation records fail acquisition without resetting the
record or running leader work.

Made `onLeader` setup/cleanup state explicit so each setup and voluntary cleanup runs
at most once per held interval. Callback errors cannot strand coordinator teardown.
The testing adapter remains deterministically oldest-created and is now documented as
different from browser-controlled Web Lock ordering.

Evidence:

- `pnpm test`: 228 tests passed, including seven direct Web Lock authority/fencing tests
  and 36 protocol validation tests.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed.
- Full Chromium suite: 34 tests passed. Browser instrumentation observed zero overlap
  across eight callback intervals and covered abrupt top-level close, queued destroy,
  held destroy, terminated execution context, refresh, late join, and transfer.
- Chromium lifecycle instrumentation confirmed a frozen holder retained one held lock
  with one queued contender and no false failover until voluntary release.
- Existing capability tests cover actionable insecure-context and missing-Web-Locks
  failures before resource attachment.

Expanded the listed file scope to the protocol validator/tests, runtime error wording,
shared e2e fixture, and milestone index; these changes carry and verify the fenced
leader projection and synchronize the authoritative plan status.
