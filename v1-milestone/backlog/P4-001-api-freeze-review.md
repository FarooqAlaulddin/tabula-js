---
id: P4-001
title: Complete the feature matrix and freeze the API candidate
phase: 4
status: todo
depends_on: [P4-002, P2-004]
owner: agent
scope: complete public surface/support review + feature evidence audit
---

## Context

After real `0.2.0` artifacts prove the technical core, the project can select the
feature-complete API candidate for `0.3.0`. This is the last planned opportunity to
improve public naming and type ergonomics before burn-in. Later breaking corrections
are allowed only through a new `0.x` release and evidence reset.

## Task

Review every exported core and testing symbol plus package export condition:

- Naming and subscription consistency; claim/open/release/focus result/error semantics.
- Ready/destroy and pre-ready/post-destroy behavior.
- Option defaults after Web Locks, including heartbeat/timeout/session decisions.
- State delete/tombstone and `setAll` public semantics.
- Leader and view event payload generations/tokens without exposing unnecessary internals.
- Framework-neutral integration ergonomics, including direct React application usage.
- Testing/browser divergence and completeness of mock interfaces.
- Node, TypeScript, browser, secure-context, and storage support policy.
- Error classes/messages and protocol incompatibility observability.
- Same-origin threat model, unsafe-data guidance, state-data exposure, prototype
  pollution defenses, dependency/supply-chain surface, and privacy implications of
  dogfood instrumentation.
- Internal export hygiene and semver classification of every accepted change.

Fill every implementation/unit/browser/docs cell in FEATURE-COMPLETE with evidence.
Generate and commit a machine-readable API/declaration baseline for later diffs.

## Acceptance criteria

- [ ] Outcome records keep/change rationale for every review category above.
- [ ] No undocumented public export and no documented symbol absent from packed declarations.
- [ ] FEATURE-COMPLETE has no missing implementation, unit, browser, or docs evidence required before burn-in.
- [ ] Full three-engine, package, sample, compatibility, lint, typecheck, and unit gates pass.
- [ ] API/declaration baseline is generated from packed candidate artifacts and reproducible.
- [ ] Root/package docs exactly match the selected API and support policy.

## Files

Public core/testing APIs, manifests, docs, API snapshot tooling/artifact,
FEATURE-COMPLETE, and tests required by accepted decisions.

## Outcome

(pending)
