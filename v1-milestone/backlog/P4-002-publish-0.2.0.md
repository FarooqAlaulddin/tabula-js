---
id: P4-002
title: Publish 0.2.0 alpha and technical preview
phase: 4
status: in-progress
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

- [ ] The alpha package shows npm provenance and installs under `next`; `latest` remains untouched.
- [ ] Full package, browser, sample, and compatibility suites pass against npm-installed alpha artifacts.
- [ ] The `0.2.0` package publishes with provenance.
- [ ] Scratch ESM/CJS/TypeScript/React-app/browser consumers use the public artifact successfully.
- [ ] GitHub releases and manifests/checksums exist for alpha and preview.
- [ ] P3-004 contains immutable `0.2.0` fixture metadata used by later candidates.

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

No acceptance criterion is complete yet because neither `0.2.0-alpha.0` nor `0.2.0`
has been published from npm with provenance.
