---
id: P1-003
title: Prove adversarial lifecycle and concurrency behavior
phase: 1
status: todo
depends_on: [P1-004]
owner: agent
scope: portable adversarial suite + Chromium lifecycle suite + manual evidence harness
---

## Context

The happy-path suite does not prove I1-I9 under scheduling and lifecycle adversity.
This task exercises the final protocol across engines and produces the raw evidence
for the public behavior contract.

Use `docs/CONTRACT.md` sections 3-9 as the assertion oracle. Tests must distinguish
Web Lock authority from eventual projections and browser-policy outcomes.

## Task

Portable three-engine scenarios:

- 8-tab join/leave/open/claim storms with converged presence, one leader, and one owner per view.
- Simultaneous leader/view-holder termination, lock-authorized transfer, and eventual registry cleanup.
- Refresh storms for normal and opener-created tabs with stable identity and no dedup ghosts.
- Destroy at every initialization/lock/sync/open stage, including destroy-before-ready.
- Backgrounding past configured timeouts without false permanent membership or state divergence.
- Mixed supported and unsupported protocol fixtures during a simulated deployment.
- Reordered/delayed set/delete/sync/view messages where the harness permits controlled delivery.
- In-memory stress of at least 10,000 validated messages and 1,000 lifecycle/claim
  cycles, proving all bounded stores return to their documented steady-state caps.

Chromium/CDP scenarios:

- Freeze/unfreeze a follower, leader, and view owner separately. Assert the CONTRACT
  behavior, recovery, and absence of ghost callbacks/claims.
- Exercise bfcache navigation/restore and a best-effort discard/reload scenario.

Manual evidence harness/checklist:

- OS sleep/wake, real memory-saver discard, private browsing, storage blocking/quota,
  multiple windows/monitors, and browser restart where applicable.

## Acceptance criteria

- [ ] At least 10 portable adversarial tests pass on Chromium, Firefox, and WebKit.
- [ ] Chromium lifecycle tests cover follower, leader, and view-owner freeze/recovery.
- [ ] Three consecutive full matrix runs pass with retries disabled; any quarantine requires a blocking issue.
- [ ] Invariant checks use direct interval/owner/operation instrumentation, not proxy assertions.
- [ ] Manual harness and dated checklist are reproducible and feed P2-003/P6-001.
- [ ] FEATURE-COMPLETE browser cells touched by this task contain evidence links.

## Files

New/updated edge-case specs, fixtures/helpers, Playwright config if needed,
FEATURE-COMPLETE evidence links, and this Outcome.

## Outcome

(pending)
