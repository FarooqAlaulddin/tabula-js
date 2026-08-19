---
id: P1-007
title: Make named-view ownership atomic and fenced
phase: 1
status: done
depends_on: [P1-002]
owner: agent
scope: view authority/registry/open protocol + unit/browser tests
---

## Context

Named views are Tabula's defining product feature, but current ownership is a
non-atomic localStorage read followed by write. Simultaneous claimers can both
succeed, stale handles can release later owners, and pending-open records can survive
failure indefinitely. A registry is useful for discovery but cannot be the exclusion
authority.

Implement against `docs/CONTRACT.md` section 7; the exact lock name, one-view-per-tab
rule, claim result, fencing token, release authority, and intent TTL are authoritative.

## Task

- Implement the CONTRACT-selected per-view exclusive Web Lock with the exact encoded
  workspace/view name and non-waiting `ifAvailable` claim.
- Give every successful claim a unique monotonically fenced claim token/generation.
  Registry projections and protocol messages carry it; stale claim/release/focus/
  vacancy traffic cannot mutate a newer owner.
- Make simultaneous claim results deterministic: one owner, all losers receive one
  conflict result, and all live tabs converge on the same owner projection.
- Redesign `open()` handoff with a unique intent id, target view, selected state keys,
  creation/expiry metadata, and cleanup on popup block, claim, timeout, destroy, or
  supersession. Keep only JSON-safe intent metadata in localStorage; transfer selected
  state operations through the validated BroadcastChannel handshake so all supported
  structured-clone values retain their types.
- Define ViewHandle authority. A stale handle must not release or focus a replacement
  claim; remote release, if retained, must target the exact claim token.
- Return the CONTRACT discriminated claim result and reject a second concurrently
  owned view in the same tab with `ViewAlreadyClaimedError`.
- Reconcile refresh, graceful close, crash, bfcache, frozen holders, and wake-up without
  ghost owners. Focus remains a browser-policy request and must be observed separately
  from ownership.

## Acceptance criteria

- [x] Repeated simultaneous claims across 8 tabs produce exactly one lock holder and one converged owner projection.
- [x] Stale/delayed handles and messages cannot release, focus, or overwrite a newer claim.
- [x] Popup-block, unclaimed timeout, late claim, competing open, and destroy paths leave no pending intent or listener.
- [x] Refresh/crash/freeze/bfcache tests match CONTRACT and leave no ghost registry entry.
- [x] Focus delivery is directly instrumented; browser refusal to foreground is documented separately.
- [x] `open`, `claim`, conflict, vacancy, registry queries, and ViewHandle semantics have unit and three-tab browser coverage.
- [x] Public API changes needed for claim results/tokens are recorded for P4-001 rather than hidden.

## Files

Core view/registry/open code, view/regression tests, view e2e fixtures/specs,
testing adapter, README/package docs, `docs/CONTRACT.md`, and `DECISIONS.md`.

## Outcome

- Replaced registry read/write ownership with the exact encoded per-view exclusive Web
  Lock and non-waiting `ifAvailable` claim. Persistent generations plus random claim
  ids fence registry projections, claim/release/focus/vacancy traffic, and handles.
- `claim()` now returns `Promise<ViewClaimResult>`; successful claim and `open()` paths
  share token-bearing handles. `ViewAlreadyClaimedError` enforces one view per tab.
- Rebuilt `open()` around expiring metadata-only intents and directed, validated state
  operation handoff. Exact cleanup covers popup block, 10-second configurable timeout,
  successful claim, supersession, destroy/failure, corrupt/expired metadata, and late
  ordinary claims without leaking structured-clone values into storage or URLs.
- Refresh reclaims remembered names with a fresh generation; bfcache retains the exact
  lock. Vacancy repair probes the Web Lock, so dead projections clear only after lock
  release and frozen holders are not stolen. Focus delivery is exact-token targeted.
- Updated the testing adapter, public declarations, root/package docs, demos, direct
  React example, contract/decisions, and the P4 API-freeze review record.
- Unit evidence: view, protocol, lifecycle/open cleanup, registry, coordinator,
  integration, regression, and testing-adapter suites; final run 241/241 passed.
- Browser evidence: `e2e/tests/views.spec.ts` covers eight-tab contention, three-tab
  convergence/vacancy, stale handles, exact focus delivery, refresh, frozen holder,
  bfcache, abrupt close/registry cleanup, and typed `open()` handoff. Final full run:
  47/47 Chromium tests passed.
- Final gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `node v1-milestone/validate.mjs`, and the complete Playwright suite passed. The
  Excalidraw build retains its pre-existing large-chunk warnings.
