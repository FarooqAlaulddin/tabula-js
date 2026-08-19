---
id: P6-001
title: Build and verify the 0.7.0 release-readiness candidate
phase: 6
status: todo
depends_on: [P5-003]
owner: agent
scope: frozen 0.7.0 artifact + complete independent verification
---

## Context

The `0.7.0` checkpoint converts the proven `0.6.0` behavior into the release-readiness
candidate for the `0.8.0` v1 feature milestone. It must introduce no behavior or API
change. Any defect or contract change creates another `0.x` stabilization release,
repeats affected burn-in, and then produces a replacement `0.7.x` candidate.

## Task

- Diff source, protocol, generated declarations, exports, defaults, errors, and behavior
  docs against the proven final `0.x` baseline. Only version/changelog/release metadata
  changes are allowed without returning to Phase 5.
- Publish `0.7.0` under `next` with provenance, then run every gate against npm-
  installed candidate artifacts: unit, three-engine adversarial, Safari manual, package,
  samples, demo, compatibility, API diff, dependency/license, and support docs.
- Execute upgrade scenarios from every supported frozen `0.x` fixture to the RC,
  including already-open tabs across deployment.
- Run every README/BEHAVIOR/CONTRACT executable sample and verify all links.
- Snapshot tarballs, declarations, protocol, bundle sizes, checksums, release manifest,
  full FEATURE-COMPLETE matrix, and dated Safari/manual checklist.
- Use `0.7.x` for release-only fixes; behavior/API fixes return to Phase 5 and establish
  a new evidence checkpoint before another readiness candidate.

## Acceptance criteria

- [ ] `0.7.0` contains no unburned behavior/API/protocol change from `0.6.0`.
- [ ] Every automated and manual gate passes against public RC artifacts.
- [ ] All supported mixed-version upgrade fixtures interoperate or signal reload exactly as documented.
- [ ] FEATURE-COMPLETE has no todo cells and every evidence link resolves.
- [ ] Zero open correctness, burn-in, release-blocker, or unexplained flaky-test issues.
- [ ] Candidate manifest records package hashes, provenance links, commit, API hash, protocol version, and test evidence.

## Files

Candidate changeset/release notes, manifests/snapshots, compatibility fixtures, FEATURE-COMPLETE,
manual evidence, and this Outcome.

## Outcome

(pending)
