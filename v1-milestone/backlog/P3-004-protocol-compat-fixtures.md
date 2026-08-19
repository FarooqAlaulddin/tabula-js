---
id: P3-004
title: Add frozen-version and mixed-protocol compatibility fixtures
phase: 3
status: done
depends_on: [P1-005, P3-003]
owner: agent
scope: versioned fixture artifacts + mixed-version browser harness
---

## Context

Long-lived tabs routinely span application deployments. Unit-testing validators is
not enough: each preview must be frozen as an installable fixture and the next
candidate must run alongside it in a real browser. Unsupported versions must surface
the recovery behavior defined by CONTRACT.

## Task

- Add a harness that serves two independently bundled Tabula versions on the same
  origin and namespace without workspace aliasing.
- Seed it with a minimal synthetic previous-compatible protocol participant and an
  unsupported-version participant until `0.2.0` exists.
- Test state operations/tombstones, presence, leader identity projection, view
  ownership projection, and incompatibility signaling across versions.
- Define a reproducible snapshot process for each published preview: tarball integrity,
  package version, protocol version, and fixture checksum recorded in source.
- Make candidate CI test against the latest supported frozen fixture and at least one
  unsupported fixture. Never fetch an unpinned mutable `latest` package.

## Acceptance criteria

- [x] Two independently built versions run concurrently in one Playwright context.
- [x] The supported pair interoperates for every protocol family claimed compatible.
- [x] The unsupported pair produces one documented incompatibility signal and no state/view corruption.
- [x] Fixture provenance/version/checksum is reviewable and update procedure documented.
- [x] P4-002 must snapshot published `0.2.0`; P4-003 and P6-001 consume that real fixture.

## Files

Compatibility harness, pinned fixtures/metadata, browser specs, CI integration, and CONTRACT deployment docs.

## Outcome

- Added a packed-tarball candidate build and separately served frozen participants;
  neither side resolves a workspace alias at runtime.
- The synthetic revision-0 fixture covers legacy state set/delete shapes, presence,
  leader projection, and view ownership against the revision-1 candidate.
- The unsupported-major fixture proves repeated unsafe traffic emits one recovery
  signal and cannot mutate candidate state or views.
- SHA-256 metadata is validated before every build, with the published-fixture
  snapshot procedure and immutable-input rule documented in `compat/README.md`.
- CI runs both cases in Chromium, Firefox, and WebKit and retains failure evidence.
  All six local browser cases pass.
