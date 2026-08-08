---
id: P6-001
title: Build and verify 1.0.0-rc.N
phase: 6
status: todo
depends_on: [P5-003]
owner: agent
scope: frozen RC artifact + complete independent verification
---

## Context

The release candidate converts the proven final `0.x` behavior into the proposed 1.0
contract. It must introduce no behavior or API change. Any defect or contract change
creates another `0.x` release, repeats affected burn-in, and then produces a later RC.

## Task

- Diff source, protocol, generated declarations, exports, defaults, errors, and behavior
  docs against the proven final `0.x` baseline. Only version/changelog/release metadata
  changes are allowed without returning to Phase 5.
- Publish `1.0.0-rc.0` under `next` with provenance, then run every gate against npm-
  installed RC artifacts: unit, three-engine adversarial, Safari manual, package,
  samples, demo, compatibility, API diff, dependency/license, and support docs.
- Execute upgrade scenarios from every supported frozen `0.x` fixture to the RC,
  including already-open tabs across deployment.
- Run every README/BEHAVIOR/CONTRACT executable sample and verify all links.
- Snapshot tarballs, declarations, protocol, bundle sizes, checksums, release manifest,
  full FEATURE-COMPLETE matrix, and dated Safari/manual checklist.
- Use later RC numbers for release-only fixes; behavior/API fixes return to Phase 5.

## Acceptance criteria

- [ ] RC contains no unburned behavior/API/protocol change from the final proven `0.x`.
- [ ] Every automated and manual gate passes against public RC artifacts.
- [ ] All supported mixed-version upgrade fixtures interoperate or signal reload exactly as documented.
- [ ] FEATURE-COMPLETE has no todo cells and every evidence link resolves.
- [ ] Zero open correctness, burn-in, release-blocker, or unexplained flaky-test issues.
- [ ] RC manifest records package hashes, provenance links, commit, API hash, protocol version, and test evidence.

## Files

RC changeset/release notes, manifests/snapshots, compatibility fixtures, FEATURE-COMPLETE,
manual evidence, and this Outcome.

## Outcome

(pending)
