---
id: P3-001
title: Prove the provenance-backed release workflow
phase: 3
status: done
depends_on: [P3-002, P3-003, P3-004]
owner: agent
scope: version-PR + publish workflow + dry-run evidence
---

## Context

Releases use npm trusted publishing through GitHub OIDC, never a long-lived npm token.
Dry-run cannot prove the OIDC exchange or provenance attestation, so the first real
integration proof is `0.2.0-alpha.0` under `next` in P4-002.

## Task

- Add a Changesets version-PR/publish workflow with least-required permissions,
  pinned Node/pnpm, frozen install, and reviewed/pinned action versions.
- Before publish, run lint, build, typecheck, unit tests, portable browser matrix,
  package gate, sample harness, and compatibility harness against packed artifacts.
- Publish the package with public access and provenance enabled. Fail if a pre-1.0
  workflow targets `latest`.
- Create signed/annotated tags as selected, GitHub releases, changelog notes, tarball
  checksums, and a machine-readable release manifest.
- Add workflow_dispatch dry-run that performs the exact pipeline through
  `npm publish --dry-run` but clearly reports that OIDC/provenance remain unproven.
- Document human npm trusted-publisher setup for the package name, including the
  public-repository prerequisite for provenance.

## Acceptance criteria

- [x] Dry-run workflow is green and publishes only the validated packed artifact.
- [x] No npm token secret is required or referenced.
- [x] Provenance/public-access configuration is visible and inherited by the real publish command.
- [x] A negative test proves `latest` is rejected for alpha/preview/RC versions.
- [x] GitHub release notes and manifest can be generated without publishing.
- [x] Human npm/OIDC setup checklist is ready for P4-002.

## Files

Release/CI workflows, release scripts/configuration, changesets config if needed, and release docs.

## Outcome

- Added a SHA-pinned Changesets v2 version-PR workflow and a separately permissioned
  release-candidate/publish pipeline. Builds and tests have read-only repository
  access; only the protected `npm` environment job receives `contents: write` and
  `id-token: write`.
- The candidate job runs lint, build, typecheck, unit, all three portable browser
  engines, the packed demo, frozen compatibility, and the full package gate. The
  package gate copies its already validated tarball instead of rebuilding for publish.
- Release tooling binds package/version/tag, source commit, workflow, tarball bytes,
  release notes, and SHA-256 values in a machine-readable manifest. Artifact transfer
  rechecks all identities and checksums before the real npm command.
- Real publish rejects token credentials and non-main refs, requires GitHub OIDC, and
  invokes `npm publish <tarball> --access public --tag <tag> --provenance`. It then
  creates an annotated package/version tag and GitHub release from the same artifacts.
- Six unit controls reject `latest` for alpha, preview, and RC versions and enforce
  public/provenance manifest policy. A manual tamper control proved modified release
  notes fail checksum verification.
- GitHub Actions run `31871214612` completed the unprivileged candidate job in 7m48s:
  257 unit, 162 browser, 9 demo, and 6 compatibility tests passed; the 18-file package
  measured 15,512 gzip bytes, npm dry-run targeted public `next`, and artifact
  `9243551688` retained the tarball, notes, and checksum manifest.
- `docs/RELEASING.md` now contains the npm trusted-publisher, public-repository,
  protected-environment, no-token, and exact repository URL checklist for P4-002.
  Actual OIDC exchange and provenance publication remain intentionally unproven until
  the human-owned `0.2.0-alpha.0` publish.
- Expanded `## Files` to include `.gitignore`, `biome.json`, and the task ledger because
  generated release artifacts need lint/working-tree boundaries and completion evidence.
