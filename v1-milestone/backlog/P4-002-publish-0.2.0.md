---
id: P4-002
title: Publish 0.2.0 alpha and technical preview
phase: 4
status: todo
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

- Create/confirm ownership of both npm names and configure GitHub Actions trusted
  publishers for the exact release workflow/environment.
- Approve the alpha and technical-preview version PRs.

Agent preparation/execution support:

- Prepare alpha changeset/release notes and run the proven dry-run.
- Publish `0.2.0-alpha.0`, verify provenance, GitHub release, package metadata, install,
  ESM/CJS/types, browser quick start, and core-before-React dependency resolution.
- Run the full suite against the npm-installed alpha, not workspace packages.
- Correct any release-only issue through another alpha; do not mutate a published version.
- Publish `0.2.0` under `next` only when alpha evidence is clean.
- Snapshot the real `0.2.0` tarballs/checksums into P3-004 compatibility fixtures.

## Acceptance criteria

- [ ] Both alpha packages show npm provenance and install under `next`; `latest` remains untouched.
- [ ] Full package, browser, sample, and compatibility suites pass against npm-installed alpha artifacts.
- [ ] Both `0.2.0` packages publish with provenance and correct inter-package ranges.
- [ ] Scratch ESM/CJS/TypeScript/React/browser consumers use the public artifacts successfully.
- [ ] GitHub releases and manifests/checksums exist for alpha and preview.
- [ ] P3-004 contains immutable `0.2.0` fixture metadata used by later candidates.

## Files

Changesets/release notes, frozen fixture metadata, GitHub/npm settings, and this Outcome.

## Outcome

(pending)
