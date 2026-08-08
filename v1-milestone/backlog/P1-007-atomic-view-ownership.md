---
id: P1-007
title: Make named-view ownership atomic and fenced
phase: 1
status: todo
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

## Task

- Implement the CONTRACT-selected per-view exclusion authority, expected to be an
  exclusive Web Lock whose name includes the workspace and view.
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
- Reconcile refresh, graceful close, crash, bfcache, frozen holders, and wake-up without
  ghost owners. Focus remains a browser-policy request and must be observed separately
  from ownership.

## Acceptance criteria

- [ ] Repeated simultaneous claims across 8 tabs produce exactly one lock holder and one converged owner projection.
- [ ] Stale/delayed handles and messages cannot release, focus, or overwrite a newer claim.
- [ ] Popup-block, unclaimed timeout, late claim, competing open, and destroy paths leave no pending intent or listener.
- [ ] Refresh/crash/freeze/bfcache tests match CONTRACT and leave no ghost registry entry.
- [ ] Focus delivery is directly instrumented; browser refusal to foreground is documented separately.
- [ ] `open`, `claim`, conflict, vacancy, registry queries, and ViewHandle semantics have unit and three-tab browser coverage.
- [ ] Public API changes needed for claim results/tokens are recorded for P4-001 rather than hidden.

## Files

Core view/registry/open code, view/regression tests, view e2e fixtures/specs,
testing adapter, README/package docs, `docs/CONTRACT.md`, and `DECISIONS.md`.

## Outcome

(pending)
