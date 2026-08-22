---
id: P4-002
title: Publish 0.2.0 alpha and technical preview
phase: 4
status: done
depends_on: [P1-003, P3-001]
owner: human
scope: npm trusted-publisher setup + alpha proof + preview release
---

## Context

`0.2.0-alpha.0` is the first real npm/OIDC/provenance integration test. `0.2.0`
follows only after the alpha installs and runs from npm and the complete coordination
suite passes against that published artifact. Both remain explicitly pre-1.0 and use
the `next` dist-tag.

## Task

Human prerequisites:

- Create/confirm ownership of the npm name, make the source repository public for
  provenance, and configure the GitHub Actions trusted publisher for the exact
  release workflow/environment.
- Approve the alpha and technical-preview version PRs.

Agent preparation/execution support:

- Prepare alpha changeset/release notes and run the proven dry-run.
- Publish `0.2.0-alpha.0`, verify provenance, GitHub release, package metadata, install,
  ESM/CJS/types, and the browser quick start.
- Run the full suite against the npm-installed alpha, not workspace packages.
- Correct any release-only issue through another alpha; do not mutate a published version.
- Publish `0.2.0` under `next` only when alpha evidence is clean.
- Snapshot the real `0.2.0` tarballs/checksums into P3-004 compatibility fixtures.

## Acceptance criteria

- [x] The alpha package shows npm provenance and installs under `next`; `latest` remains untouched.
- [x] Full package, browser, sample, and compatibility suites pass against npm-installed alpha artifacts.
- [x] The `0.2.0` package publishes with provenance.
- [x] Scratch ESM/CJS/TypeScript/React-app/browser consumers use the public artifact successfully.
- [x] GitHub releases and manifests/checksums exist for alpha and preview.
- [x] P3-004 contains immutable `0.2.0` fixture metadata used by later candidates.

## Files

Changesets/release notes, frozen fixture metadata, GitHub/npm settings, and this Outcome.

## Outcome

In progress as of 2026-08-19:

- PR #1 (<https://github.com/FarooqAlaulddin/tabula-js/pull/1>) merged the
  prerelease-ready source and release workflow preparation into `main`.
- Release workflow failures on `main` were corrected without weakening gates:
  stale Changesets package scope was fixed in commit `0228910`, and the obsolete
  `changesets/action` `commit-mode` input was removed in commit `d9e844b`.
- PR #2 (<https://github.com/FarooqAlaulddin/tabula-js/pull/2>) generated the
  Changesets prerelease version and was merged as commit `fe29c56`, setting
  `@thinkly/tabula-js` to `0.2.0-alpha.0` and updating the changelog.
- PR #2 CI passed test, packed-package, Chromium/Firefox/WebKit E2E, and
  Chromium/Firefox/WebKit compatibility checks. The Release workflow's unprivileged
  "Validated release candidate" job also passed lint, build, typecheck, unit tests,
  full portable browser matrix, packed documentation samples, packed demo harness,
  frozen compatibility, release tarball validation, dry-run publish, and artifact
  retention.
- The subsequent `main` Release workflow run
  <https://github.com/FarooqAlaulddin/tabula-js/actions/runs/32240229604>
  completed successfully and no longer attempts to create a stale version PR.
- `npm view @thinkly/tabula-js version dist-tags --json` still returns `E404`; the
  package does not yet exist in the registry. The prepared bootstrap placeholder at
  `/tmp/tabula-npm-bootstrap-thinkly-0.0.0` dry-runs as a one-file
  `@thinkly/tabula-js@0.0.0` package under the intended `bootstrap` tag. Its real
  publish requires the maintainer's current npm OTP and remains the current blocker.
- Rechecked on 2026-08-22: `npm view @thinkly/tabula-js version dist-tags --json`
  still returns `E404`, and `npm whoami` returns `E401` in this shell, so no
  authenticated maintainer session is currently available here. The old `/tmp`
  placeholder was not present, so commit-local bootstrap preparation now uses
  `pnpm release:bootstrap-placeholder` to generate a fresh one-file placeholder,
  dry-run it with npm, and print the exact authenticated publish command. This
  expands the P4-002 support files to include
  `scripts/create-npm-bootstrap-placeholder.mjs`, `package.json`, and
  `docs/RELEASING.md`.
- Bootstrap publish completed on 2026-08-22 from an authenticated maintainer session.
  `npm access list packages @thinkly --json` reports `@thinkly/tabula-js` as
  `read-write`, `npm access get status @thinkly/tabula-js --json` reports `public`,
  and `npm view @thinkly/tabula-js time versions dist-tags --json` reports version
  `0.0.0` created at `2026-08-22T10:16:58.104Z` with `bootstrap: 0.0.0`. npm also
  retained `latest: 0.0.0` because this is the only published version; attempts to
  remove it returned registry `E400`. This placeholder is outside the release train
  and contains only package metadata. Install docs now use `@next` so untagged
  installs do not represent a milestone artifact.

At the bootstrap checkpoint, no acceptance criterion was complete because neither
`0.2.0-alpha.0` nor `0.2.0` had been published from npm with provenance.

Alpha publication completed on 2026-08-22:

- npm Trusted Publishing is configured for `FarooqAlaulddin/tabula-js`, workflow
  `release.yml`, environment `npm`, with only `npm publish` permission.
- Release run <https://github.com/FarooqAlaulddin/tabula-js/actions/runs/32570003403>
  published `@thinkly/tabula-js@0.2.0-alpha.0` under `next` from commit `8c30c7e`.
  npm exposes a SLSA provenance attestation, while `latest` remains on the inert
  `0.0.0` bootstrap placeholder.
- The immutable GitHub prerelease is
  <https://github.com/FarooqAlaulddin/tabula-js/releases/tag/%40thinkly/tabula-js%400.2.0-alpha.0>.
  Its tarball SHA-256 is
  `16dd7ce4a77730e880c0546ddbec24d2fd55b04755074e18660b7dc15f01c0a4`.
- The workflow's first verification attempt exposed an argument-forwarding defect,
  not an artifact defect. Commit `2aa132f` corrected the invocation and added a
  workflow regression test. The corrected public-registry gate then passed locally:
  package and documentation consumers, 162 coordination tests, 15 demo tests, and
  6 compatibility tests across Chromium, Firefox, and WebKit.
- Immutable evidence is committed under
  `v1-milestone/release-evidence/0.2.0-alpha.0/`. At that checkpoint, stable `0.2.0`,
  its consumer checks, and frozen compatibility metadata still remained.

Stable technical-preview publication completed on 2026-08-22:

- Release run <https://github.com/FarooqAlaulddin/tabula-js/actions/runs/32570633219>
  published `@thinkly/tabula-js@0.2.0` from commit `0ec72a6`. npm exposes SLSA
  provenance and `next: 0.2.0`; `latest` remains on the inert `0.0.0` placeholder.
- The GitHub release is
  <https://github.com/FarooqAlaulddin/tabula-js/releases/tag/%40thinkly/tabula-js%400.2.0>.
  Registry and release tarballs match SHA-256
  `dfe4fce7ce1dbcbe186d24176b0b235c7e9ced31c088b0c57320e11a431ba1a7`.
- A clean-checkout verifier defect was found after publication: canonical API docs
  still read workspace declarations instead of the supplied package. Commit
  `3cc18f1` changed the gate to read declarations from the installed registry
  tarball. With workspace `dist` absent, the corrected verifier passed package,
  documentation, 162 coordination, 15 demo, and 6 compatibility tests across all
  three engines.
- `compat/fixtures/0.2.0/` freezes the exact npm tarball and an independently bundled
  participant. The manifest records npm integrity, package and participant SHA-256,
  source commit, registry, and protocol range. Nine mixed-version browser cases pass
  across Chromium, Firefox, and WebKit.
- Stable release manifests and public-registry results are committed under
  `v1-milestone/release-evidence/0.2.0/`. Every acceptance criterion is satisfied.
