---
id: P5-002
title: Stabilize through evidence-resetting 0.x releases
phase: 5
status: done
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

- [x] Every burn-in issue has classification, resolution, regression evidence, and release version.
- [x] No correctness defect is waived solely to preserve schedule or avoid an API change.
- [x] Every release is adopted by affected apps and evidence-reset boundaries are recorded.
- [x] Compatibility/API snapshots include every candidate that remains in the supported upgrade path.
- [x] `is:issue label:burn-in is:open` returns zero before P5-003 starts.
- [x] All affected apps run the provenance-backed `0.5.0` stabilization checkpoint.

## Files

Issue tracker, required implementation/tests/docs/changesets, frozen fixtures/baselines,
external app upgrades, FEATURE-COMPLETE, and this Outcome.

## Outcome

Completed on 2026-08-22:

- The `0.4.0` dogfood checkpoint exposed two observability/release-gate defects, not a
  Tabula runtime or public-API correction. Thread pull request
  <https://github.com/FarooqAlaulddin/threads/pull/238> made leader overlap,
  duplicate valid view ownership, ghost tab/view state, view release, and repairs lasting
  at least 60 seconds directly reportable, with regression coverage. Tabula commit
  `9026884` made the compatibility suite discover and execute every frozen published
  fixture instead of maintaining a hard-coded version list.
- `@thinkly/tabula-js@0.5.0` is behavior/API/protocol-identical to `0.4.0`; it was
  provenance-published under `next` by release run
  <https://github.com/FarooqAlaulddin/tabula-js/actions/runs/32604621595>. Registry
  verification passed package, documentation, demo, compatibility, Chromium, Firefox,
  and WebKit gates. Its exact artifact, hashes, source commit, and API baseline are
  frozen in `compat/fixtures/0.5.0/`, `v1-milestone/release-evidence/0.5.0/`, and
  `v1-milestone/api-baselines/0.5.0/`.
- The corrected compatibility matrix executed 18 tests across Chromium, Firefox, and
  WebKit against `0.2.0`, `0.3.0`, `0.4.0`, and `0.5.0`. Thread verification passed
  120 backend tests, mypy, 11 frontend tests, production build, npm audit with zero
  vulnerabilities, and all eight CI jobs on merged commit
  `22d0564bdfa216bf3e9b41aaaaca4f7706c3a392`.
- Thread Workspaces adopted the exact public `0.5.0` artifact and was deployed to
  staging and both production nodes as release `v1.0.40`. Service health, deep health,
  smoke tests, public endpoints, and both edge-routed production members passed.
- The issue query `is:issue label:burn-in is:open` returned zero at closure. The final
  evidence-reset boundary is the production `0.5.0` deployment on 2026-08-22. The
  initial privacy-safe aggregate is archived under `v1-milestone/evidence/P5-003/`;
  it contains zero sessions and zero anomalies and therefore starts, but does not
  satisfy, P5-003. That first collection design was subsequently retired by Thread
  pull request <https://github.com/FarooqAlaulddin/threads/pull/241>; the empty
  aggregate remains historical evidence only.
