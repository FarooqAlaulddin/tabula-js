---
id: P4-003
title: Publish the feature-complete 0.3.0 API candidate
phase: 4
status: done
depends_on: [P4-001]
owner: human
scope: one candidate release + public artifact verification
---

## Context

`0.3.0` is the first release that claims feature completeness for the intended v1
scope. It remains pre-1.0: burn-in may require breaking corrections, but every such
correction must be released and restart affected evidence.

## Task

- Prepare a changeset and release notes organized by the seven product capabilities.
- Run all gates against packed candidate artifacts and the frozen `0.2.0` fixture.
- Publish the package with provenance under `next`; verify public docs/demo links.
- Install from npm into clean ESM/CJS/React-app/browser consumers and execute every sample.
- Snapshot `0.3.0` tarballs, API declarations, protocol version, and checksums as the
  baseline for burn-in and eventual `0.8.0` comparison.
- Announce it only as a feature-complete preview/API candidate, not stable semver 1.x.

## Acceptance criteria

- [x] `0.3.0` publishes under `next` with provenance.
- [x] All CI/package/browser/sample/compatibility gates pass against npm artifacts.
- [x] FEATURE-COMPLETE pre-burn-in cells are all done with evidence links.
- [x] API/protocol/tarball baselines and GitHub release notes are immutable and linked.
- [x] Live demo and npm docs use the published candidate without workspace-only behavior.

## Files

Changeset/release notes, frozen baseline metadata, deployment configuration if version-pinned,
and this Outcome.

## Outcome

Completed on 2026-08-22:

- Commit `181891d` prepared the version/release metadata and reproducible API baseline
  without changing runtime, declarations, exports, defaults, or protocol from the
  frozen `0.2.0` candidate. Release notes describe all seven product capabilities
  and identify the release as a pre-1.0 preview.
- Release run <https://github.com/FarooqAlaulddin/tabula-js/actions/runs/32571519048>
  passed the complete candidate pipeline, published `@thinkly/tabula-js@0.3.0` with
  SLSA provenance under `next`, created the immutable GitHub release, then passed the
  independent public-registry verification job.
- Public-artifact verification passed package exports, ESM/CJS/TypeScript/React and
  browser documentation samples, 162 coordination tests, 15 demo tests, and the
  mixed-protocol suite across Chromium, Firefox, and WebKit. npm `latest` remains on
  the inert `0.0.0` placeholder.
- `v1-milestone/api-baselines/0.3.0/` freezes declarations and export conditions.
  `v1-milestone/release-evidence/0.3.0/` records the release manifest, npm integrity,
  tarball SHA-256, source commit, and verified gates.
- `compat/fixtures/0.3.0/` freezes the exact registry tarball and independently
  bundled participant. Twelve compatibility cases now test synthetic revision 0,
  published `0.2.0`, published `0.3.0`, and unsupported major 2 across all engines.
- P4-001 confirmed every FEATURE-COMPLETE implementation, unit, browser, and docs
  cell has concrete evidence. Remaining row statuses represent manual Safari and
  real-application burn-in evidence, not missing pre-burn-in implementation proof.
- The live demo and Excalidraw route are package-artifact tested, and the npm README
  is the same canonical package documentation validated by the release workflow.
