---
id: P3-001
title: Prove the provenance-backed release workflow
phase: 3
status: todo
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

- [ ] Dry-run workflow is green and publishes only the validated packed artifact.
- [ ] No npm token secret is required or referenced.
- [ ] Provenance/public-access configuration is visible and inherited by the real publish command.
- [ ] A negative test proves `latest` is rejected for alpha/preview/RC versions.
- [ ] GitHub release notes and manifest can be generated without publishing.
- [ ] Human npm/OIDC setup checklist is ready for P4-002.

## Files

Release/CI workflows, release scripts/configuration, changesets config if needed, and release docs.

## Outcome

(pending)
