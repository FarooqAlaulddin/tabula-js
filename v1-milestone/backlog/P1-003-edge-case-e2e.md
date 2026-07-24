---
id: P1-003
title: Edge-case e2e — throttling, suspension, teardown races
phase: 1
status: todo
depends_on: [P1-001, P1-002, P1-004]
owner: agent
scope: 1-2 new e2e spec files + fixture tweaks
---

## Context

The e2e suite covers happy paths and basic failover. Stability claims need adversarial coverage of the browser behaviors that break naive tab coordination — and the results feed docs/BEHAVIOR.md (P2-003). Depends on P1-004 so new specs run cross-browser where possible.

Design review caveats to respect: `Page.setWebLifecycleState` (freeze/discard) is CDP/Chromium-only, and a genuinely *frozen* tab stops running the timers that write its heartbeat — so "frozen tab is never pruned" is not the expected behavior. Define expectations honestly: a frozen tab MAY be pruned as dead; the requirement is clean *recovery* (rejoin, reconcile, re-claim or observe vacated views) on unfreeze, with no ghost state.

## Task

Split specs by portability:

**Cross-browser (`e2e/tests/edge-cases.spec.ts` — chromium/firefox/webkit):**
- **Many tabs**: 8 tabs join/leave rapidly; presence converges, exactly one leader at the end, no orphaned view claims.
- **Simultaneous close**: close leader and a view-holder at the same instant; new leader emerges, `view:vacant` fires.
- **Refresh storm**: refresh the same tab 5× rapidly; tab id persists, no duplicate presence entries, dedup nonce prevents ghost messages.
- **destroy() mid-flight**: destroy during a state broadcast; no errors, peers prune the departed tab.
- **Backgrounded (not frozen) tab**: `page.bringToFront()` on another tab, wait past `timeout`, verify the backgrounded tab is not pruned and converges on return to foreground.

**Chromium-only (`e2e/tests/edge-cases.chromium.spec.ts`, guarded/skipped elsewhere):**
- **Freeze/unfreeze** via CDP `Page.setWebLifecycleState`: while frozen, peers may prune the tab (assert whichever behavior the implementation defines — document it); on unfreeze, wake-up reconciliation restores presence and state within one heartbeat round, and any view it held is either re-claimed or was cleanly vacated.

Record behaviors that can't be automated (OS sleep/wake, incognito storage limits, real tab-discard under memory pressure) as a manual-verification checklist in this file's Outcome, for P2-003 to document.

## Acceptance criteria

- [ ] Cross-browser spec: ≥5 tests passing on chromium, firefox, webkit in CI.
- [ ] Chromium-only spec: freeze/recovery test passing, properly skipped on other projects.
- [ ] No flakiness: 3 consecutive full `pnpm test:e2e` runs green.
- [ ] The frozen-tab expectation (pruned-then-recovers vs retained) is stated in the spec and matches DECISIONS.md.
- [ ] Manual checklist for non-automatable cases written in Outcome.

## Files

`e2e/tests/edge-cases.spec.ts` (new), `e2e/tests/edge-cases.chromium.spec.ts` (new), possibly `e2e/fixtures/index.html`.

## Outcome

(pending)
