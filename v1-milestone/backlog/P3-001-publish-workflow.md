---
id: P3-001
title: Release workflow — changesets publish with npm provenance
phase: 3
status: todo
depends_on: [P3-002, P0-004]
owner: agent
scope: 1 workflow file + CI adjustments
---

## Context

P3-002 established changesets as the release model. This task builds the single publish workflow around it. Auth decision, recorded here so no task guesses: **npm trusted publishing (OIDC), no long-lived token.** The maintainer configures the trusted publisher on npmjs.com per package (human prerequisite, listed in P4-002); the workflow needs only `id-token: write`.

Known limitation: `npm publish --dry-run` cannot verify OIDC exchange, trusted-publisher config, or provenance attestation — those are only proven by a real publish. Therefore the first real publish is an `0.2.0-rc.*` prerelease under a `next` dist-tag, serving as the provenance integration test before 0.2.0 proper (folded into P4-002's flow).

## Task

- Add `.github/workflows/release.yml` using the changesets action: changeset on main → version PR; merging the version PR → build, typecheck, unit tests, e2e (chromium), then `pnpm release` (from P3-002) publishing core → react in dependency order with `--provenance --access public`.
- Permissions: `id-token: write`, `contents: write` (version PR + tags), `pull-requests: write`.
- Pin the Node version and use the `packageManager` field (P0-004) for pnpm.
- Add a `workflow_dispatch` input `dry_run` that runs the full pipeline through `npm publish --dry-run` for both packages — verifies everything *except* OIDC/provenance (see Known limitation).
- Create a GitHub release with the changeset-generated notes on each publish.

## Acceptance criteria

- [ ] Workflow present; `gh workflow list` shows it.
- [ ] Manual `dry_run` dispatch goes green end-to-end on CI.
- [ ] Publish order proven core → react in the dry-run logs; react's dependency range resolves to the core version being published.
- [ ] The rc-prerelease-first rule is written into P4-002's flow (verify, and update P4-002 if its text predates this).

## Files

`.github/workflows/release.yml` (new), possibly `.github/workflows/ci.yml`.

## Outcome

(pending)
