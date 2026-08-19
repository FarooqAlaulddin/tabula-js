---
id: P5-002
title: Stabilize through evidence-resetting 0.x releases
phase: 5
status: todo
depends_on: [P5-001]
owner: human
scope: burn-in issue triage + any required 0.x releases
---

## Context

Burn-in is expected to find defects. Fixes must not accumulate only on main while
apps continue exercising an older candidate. Every meaningful correction is released,
adopted, and given fresh evidence. Breaking API/protocol changes are still legal in
`0.x`, but they reset all affected evidence.

## Task

- Triage every `burn-in` anomaly as correctness defect, documentation/support-policy
  correction, consumer misuse, observability defect, or unrelated issue.
- Fix correctness and observability defects with regression tests at the lowest layer
  plus browser/consumer coverage where observable.
- Publish fixes according to semver impact, then establish and adopt `0.5.0` as the
  stabilization checkpoint, with
  provenance and updated compatibility fixtures/API baselines.
- Upgrade every dogfood app to the new candidate before resuming affected evidence.
- Mark affected FEATURE-COMPLETE rows `todo` and explicitly identify which counters
  restart. Accepted limitations must already fit CONTRACT/non-goals and be documented.
- Repeat until there are no unresolved or unexplained coordination anomalies.

## Acceptance criteria

- [ ] Every burn-in issue has classification, resolution, regression evidence, and release version.
- [ ] No correctness defect is waived solely to preserve schedule or avoid an API change.
- [ ] Every release is adopted by affected apps and evidence-reset boundaries are recorded.
- [ ] Compatibility/API snapshots include every candidate that remains in the supported upgrade path.
- [ ] `is:issue label:burn-in is:open` returns zero before P5-003 starts.
- [ ] All affected apps run the provenance-backed `0.5.0` stabilization checkpoint.

## Files

Issue tracker, required implementation/tests/docs/changesets, frozen fixtures/baselines,
external app upgrades, FEATURE-COMPLETE, and this Outcome.

## Outcome

(pending)
