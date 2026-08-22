---
id: P4-001
title: Complete the feature matrix and freeze the API candidate
phase: 4
status: done
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

API freeze completed on 2026-08-22 against the published `0.2.0` artifact:

- **Naming and subscriptions -- keep.** `createWorkspace`, `Workspace`, the
  `state`/`tabs`/`views` namespaces, `on`/`off`, and unsubscribe-returning
  subscriptions use one consistent vocabulary. Claim/open return explicit results
  or handles; release/focus live only on token-fenced handles.
- **Lifecycle -- keep.** Synchronous capability validation, bounded `ready`, explicit
  repair status, terminal idempotent `destroy()`, and typed failed/destroyed errors
  match unit, browser, CONTRACT, BEHAVIOR, and package documentation evidence.
- **Defaults -- keep.** Source and canonical docs agree on `heartbeat: 1500`,
  `timeout: 5000`, `readyTimeout: 1000`, and `openTimeout: 10000`. Web Locks remain
  the sole authority for leaders and named views.
- **State -- keep.** `set`, `delete`, and atomic `setAll` expose the intended typed
  structured-clone boundary; HLC ordering, tombstones, post-commit notifications,
  and repairable synchronization remain implementation details with documented
  behavior rather than public protocol types.
- **Leadership and views -- keep.** Leader events expose identity without claiming
  exactly-once execution. View events expose the generation/claim token needed to
  explain fencing; storage intents, correlations, and protocol payloads remain
  internal. `ViewAlreadyClaimedError` and conflict results are distinct and useful.
- **Framework and testing integration -- keep.** Framework applications consume the
  core directly; no React wrapper enters v1. The `./testing` subpath covers every
  public capability and clearly documents its deterministic leader/lifecycle
  differences from browsers.
- **Support and errors -- keep.** The contract requires top-level secure same-origin
  contexts with Web Locks, BroadcastChannel, structured clone, and usable web
  storage. Node is a package/tooling floor, not a runtime target. Capability,
  storage, lifecycle, view, and protocol incompatibility failures are public and
  documented. Playwright WebKit is not represented as Safari proof; real Safari
  remains an explicit P6-001 manual gate.
- **Security and privacy -- keep.** Same-origin traffic is trusted but fully shape-
  and size-validated; Tabula is not an authorization boundary. State exposure,
  unsafe-data/server-validation guidance, prototype-pollution defenses, zero runtime
  dependencies, and privacy review for future dogfood instrumentation are explicit.
- **Exports and semver -- freeze.** The packed root has 27 documented exports and the
  testing subpath has 3. ESM, CJS, and both declaration conditions are present,
  `sideEffects` is false, and no internal source export leaks through the package
  entrypoints. Alpha and stable declaration files have identical SHA-256 values;
  only package/release metadata changed.

Every implementation, unit, browser, and docs cell in `FEATURE-COMPLETE.md` has a
concrete evidence link. Rows remain overall `todo` where published-candidate, manual
Safari, or burn-in evidence is still intentionally pending; this does not erase the
completed pre-burn-in audit. Public-registry verification passed package and docs
consumers, 162 coordination tests, 15 demo tests, and compatibility coverage on
Chromium, Firefox, and WebKit. `pnpm lint`, `pnpm typecheck`, 263 unit/policy tests,
package/docs/API gates, and the milestone validator pass. GitHub has no open issues.

The frozen API candidate baseline is `v1-milestone/api-baselines/0.2.0/`. Any later
public API or declaration change requires an explicit `0.x` changeset, a reviewed
baseline diff, and affected evidence reset.
