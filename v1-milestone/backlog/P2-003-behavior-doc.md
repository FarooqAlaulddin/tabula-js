---
id: P2-003
title: Publish the browser behavior and support contract
phase: 2
status: todo
depends_on: [P1-003]
owner: agent
scope: behavior/support docs sourced from evidence
---

## Context

Production adopters need more than API signatures. They need to know what happens
when tabs are hidden, frozen, restored, crashed, upgraded, denied storage, or subject
to browser focus policy. P1-003 and the Safari checklist provide the evidence.

## Task

Create `docs/BEHAVIOR.md` with evidence-tagged sections for:

- Background throttling, liveness estimates, and configured timeout behavior.
- Freeze/unfreeze and real discard for followers, lock holders, and view owners.
- Laptop sleep/wake and clock movement.
- Graceful close, crash, refresh, bfcache navigation, and browser restart.
- Private browsing, storage partitioning, disabled storage, and quota failure.
- Multiple tabs versus windows, secure-context requirements, and unsupported iframes.
- Focus/popup policy and user-gesture requirements.
- Mixed-version deployment, incompatibility signaling, and reload recovery.
- State LWW/tombstone behavior and why document collaboration is out of scope.

Every material claim must link to an automated test, a dated manual result, or primary
browser documentation. Keep normative guarantees aligned with `docs/CONTRACT.md`.

## Acceptance criteria

- [ ] Every material claim is tagged tested, manually verified, or externally cited.
- [ ] No Linux WebKit result is described as Safari proof.
- [ ] No behavior is described as immediate where the contract is eventual or timeout-based.
- [ ] Browser/support table names required APIs, secure context, tested engines, and manual Safari status.
- [ ] Root README links the detail instead of duplicating divergent promises.

## Files

`docs/BEHAVIOR.md` (new), support/guarantee portions of root README, CONTRACT links,
and FEATURE-COMPLETE evidence.

## Outcome

(pending)
