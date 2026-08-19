---
id: P4-003
title: Publish the feature-complete 0.3.0 API candidate
phase: 4
status: todo
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

- [ ] `0.3.0` publishes under `next` with provenance.
- [ ] All CI/package/browser/sample/compatibility gates pass against npm artifacts.
- [ ] FEATURE-COMPLETE pre-burn-in cells are all done with evidence links.
- [ ] API/protocol/tarball baselines and GitHub release notes are immutable and linked.
- [ ] Live demo and npm docs use the published candidate without workspace-only behavior.

## Files

Changeset/release notes, frozen baseline metadata, deployment configuration if version-pinned,
and this Outcome.

## Outcome

(pending)
