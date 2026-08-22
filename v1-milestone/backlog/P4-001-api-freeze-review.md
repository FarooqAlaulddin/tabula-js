---
id: P4-001
title: Complete the feature matrix and freeze the API candidate
phase: 4
status: todo
depends_on: [P4-002, P2-004]
owner: agent
scope: complete public surface/support review + feature evidence audit
---

## Context

After real `0.2.0` artifacts prove the technical core, the project can select the
feature-complete API candidate for `0.3.0`. This is the last planned opportunity to
improve public naming and type ergonomics before burn-in. Later breaking corrections
are allowed only through a new `0.x` release and evidence reset.

## Task

Review every exported core and testing symbol plus package export condition:

- Naming and subscription consistency; claim/open/release/focus result/error semantics.
- Ready/destroy and pre-ready/post-destroy behavior.
- Option defaults after Web Locks, including heartbeat/timeout/session decisions.
- State delete/tombstone and `setAll` public semantics.
- Leader and view event payload generations/tokens without exposing unnecessary internals.
- Framework-neutral integration ergonomics, including direct React application usage.
- Testing/browser divergence and completeness of mock interfaces.
- Node, TypeScript, browser, secure-context, and storage support policy.
- Error classes/messages and protocol incompatibility observability.
- Same-origin threat model, unsafe-data guidance, state-data exposure, prototype
  pollution defenses, dependency/supply-chain surface, and privacy implications of
  dogfood instrumentation.
- Internal export hygiene and semver classification of every accepted change.

Fill every implementation/unit/browser/docs cell in FEATURE-COMPLETE with evidence.
Generate and commit a machine-readable API/declaration baseline for later diffs.

## Acceptance criteria

- [ ] Outcome records keep/change rationale for every review category above.
- [ ] No undocumented public export and no documented symbol absent from packed declarations.
- [ ] FEATURE-COMPLETE has no missing implementation, unit, browser, or docs evidence required before burn-in.
- [ ] Full three-engine, package, sample, compatibility, lint, typecheck, and unit gates pass.
- [ ] API/declaration baseline is generated from packed candidate artifacts and reproducible.
- [ ] Root/package docs exactly match the selected API and support policy.

## Files

Public core/testing APIs, manifests, docs, API snapshot tooling/artifact,
FEATURE-COMPLETE, and tests required by accepted decisions.

## Outcome

P1-007 candidate changes to review before API freeze:

- `claim(name)` changed from fire-and-forget `void` to `Promise<ViewClaimResult>` with
  explicit `claimed` and expected `conflict` branches.
- Successful claims and `open()` return the same token-fenced `ViewHandle`, exposing
  readonly `name`, `owner`, and `token`; stale handle actions are no-ops.
- `ViewAlreadyClaimedError` is public and identifies `currentView`.
- `view:claimed` and `view:vacant` include the exact token; `view:conflict` may include
  the existing projected token.
- `WorkspaceOptions.openTimeout` is public and defaults to 10 seconds.
- `ViewClaimToken` and `ViewClaimResult` are exported; storage intent/correlation
  shapes remain internal and must stay absent from the packed declaration surface.

Preparatory evidence audit on 2026-08-22, before the P4-002 dependency completed:

- `FEATURE-COMPLETE.md` now separates implementation, unit, browser, docs, burn-in,
  and status evidence columns.
- All pre-burn-in evidence cells have concrete repository links where current source,
  tests, and documentation provide evidence.
- No row was marked `done`; burn-in, npm-published artifact verification, Safari
  manual evidence, and the formal API freeze review remain incomplete.
- `pnpm api:snapshot` now generates a reproducible declaration/export baseline from
  a `scripts/verify-package.mjs`-validated tarball. The preliminary
  `0.2.0-alpha.0` snapshot is committed under
  `v1-milestone/api-baselines/0.2.0-alpha.0/` with ESM/CJS declaration files and a
  machine-readable manifest. This is preparatory only; P4-001 still requires the
  real post-P4-002 API-candidate artifact before it can be marked complete.
- `pnpm api:check` regenerates the snapshot and fails on any committed baseline diff;
  the packed-package CI job runs it after documentation and package gates.
