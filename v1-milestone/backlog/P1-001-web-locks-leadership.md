---
id: P1-001
title: Rebuild leadership on Web Locks
phase: 1
status: todo
depends_on: [P1-006]
owner: agent
scope: leader authority + identity projection + unit/browser tests
---

## Context

Presence-derived "oldest tab" leadership can split during throttling and suspension.
The 1.0 contract instead uses an exclusive Web Lock as the sole authority. This is a
semantic correction: request order is browser-controlled, and leadership is not an
exactly-once execution service.

## Task

- Request and hold the CONTRACT-defined workspace lock through an unresolved promise.
- Use one AbortController for queued acquisition and a separate explicit release path
  for a held lock. Destroy must handle both without unhandled promise rejection.
- Run `onLeader` setup only inside the held-lock interval and cleanup exactly once
  before voluntary release. Closing/crashing terminates the holder; no follower may
  run setup before it actually acquires the lock.
- Project holder identity through versioned protocol messages. Answer late joiners,
  recover after missed announcements, reject stale holder generations, and keep
  `tabs.leader()` eventually accurate without making it an authority.
- Throw a descriptive capability error when Web Locks or a secure context is absent.
- Keep the test cluster deterministic, but document that its oldest-created choice is
  a simulation and not a browser ordering guarantee.

## Acceptance criteria

- [ ] Browser instrumentation proves no overlap between active leader callback intervals across 8 contending tabs.
- [ ] Close, crash, destroy-while-queued, destroy-while-held, refresh, and late-join transfer/discovery tests pass.
- [ ] Cleanup is directly observed exactly once on voluntary demotion/destroy; replacement setup is separately observed.
- [ ] Stale/delayed leader messages cannot overwrite a newer lock-holder generation.
- [ ] A frozen holder's behavior is tested/documented without falsely promising failover while the lock remains held.
- [ ] Missing Web Locks/insecure context errors state the prerequisite and recovery.
- [ ] Core and testing-subpath leader APIs retain the CONTRACT-selected observable shape.

## Files

Core leader/coordinator code, testing adapter comments/behavior, leader unit/e2e tests,
README/package docs, `docs/CONTRACT.md`, and `DECISIONS.md`.

## Outcome

(pending)
