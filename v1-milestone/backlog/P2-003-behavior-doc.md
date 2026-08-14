---
id: P2-003
title: Publish the browser behavior and support contract
phase: 2
status: done
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

- [x] Every material claim is tagged tested, manually verified, or externally cited.
- [x] No Linux WebKit result is described as Safari proof.
- [x] No behavior is described as immediate where the contract is eventual or timeout-based.
- [x] Browser/support table names required APIs, secure context, tested engines, and manual Safari status.
- [x] Root README links the detail instead of duplicating divergent promises.

## Files

`docs/BEHAVIOR.md` (new), support/guarantee portions of root README, CONTRACT links,
and FEATURE-COMPLETE evidence.

## Outcome

- Added `docs/BEHAVIOR.md` with evidence-tagged lifecycle, scheduling, storage,
  window/focus, deployment, support, and state-boundary guidance.
- Distinguished the three-engine automated matrix from pending Safari/macOS, real
  discard, sleep/wake, private-mode, quota, restart, and cross-window manual checks.
- Updated the final matrix evidence to 162/162 across Chromium, Firefox, and WebKit,
  repeated three times without retries; Linux WebKit is explicitly not Safari proof.
- Found and documented the `structuredClone()` runtime prerequisite, then expanded
  admission tests across iframe, crypto, cloning, transport, and both storage APIs.
- Linked root positioning, CONTRACT, and affected feature-completeness rows to the
  operational guide instead of repeating unsupported promises.
- Verified 248 unit tests, lint, typechecking, production builds, milestone validation,
  local Markdown link targets, and a clean diff check.
