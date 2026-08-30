---
id: P5-003
title: Close the burn-in evidence gate
phase: 5
status: dropped
depends_on: [P5-002]
owner: human
scope: evidence audit against the final 0.x candidate
---

## Context

This gate required a production evidence window: at least 100 distinct workspace
sessions, 30 of them with two or more simultaneous tabs, 10 with three or more,
across three engines and two OS families, plus counted sleep/wake survivals,
refresh/rejoin sequences, bfcache restores, deployment-spanning sessions, leader
transfers, and view vacancy/reclaim cycles.

It was dropped on 2026-08-30. The reasoning is recorded here rather than in a
commit message because the next person to wonder why `0.8.0` shipped without
production burn-in evidence will look in this file.

## Why it was dropped

**The gate was unreachable, and not because the collector was removed.** Tabula
has one consumer: Thread Workspaces, a pre-launch application with no user base.
A collection window ran in production from 2026-08-23 against provenance-backed
`0.5.0` and recorded zero sessions and zero anomalies. No instrumentation quality
would have changed that number, because the traffic the gate counts does not
exist. Removing the collector revealed the problem; it did not create it.

**Both collectors that existed to feed this gate were retired by the consumer.**
Thread built ingestion twice and removed it twice -- migration
`0006_tabula_evidence` retired by `0008_retire_tabula_evidence`, then
`0009_coordination_diagnostics` retired by `0018_retire_coordination_diagnostics`
in Thread pull requests
<https://github.com/FarooqAlaulddin/threads/pull/323> and
<https://github.com/FarooqAlaulddin/threads/pull/325>. The second removal was
filed as a defect: the reporter spliced its queue before the fetch resolved,
ignored every failure but `409`, could exceed the server's own batch ceiling, and
was rebuilt by ordinary file selection inside the lifecycle it was observing. The
admin dashboard this task named as the way to start a window
(`/workspaces/admin/diagnostics/coordination`) no longer exists, and the
maintainer has decided the consumer collects no telemetry for this library. See
`DECISIONS.md`.

**A gate that cannot be passed is worse than no gate.** It either blocks the
milestone permanently or is waived, and a waived gate devalues every gate beside
it. Retiring it deliberately, in the open, is the honest option.

**The milestone is deliberately pre-1.0.** `PLAN.md` postpones the semver `1.0.0`
compatibility commitment and reserves `0.9.x` for breaking corrections found after
`0.8.0`. Shipping the feature milestone on automated, packed-artifact and manual
evidence is what that reservation is for.

## What carries the evidence instead

No replacement collector, aggregate, or counter is introduced. The remaining
evidence is what the repository already produces and can reproduce on demand:

- The three-engine Playwright suite (Chromium, Firefox, WebKit) over state,
  presence, leadership, views, lifecycle, capability, and adversarial specs.
- The frozen compatibility matrix, which discovers and executes every published
  fixture -- 18 tests across `0.2.0`, `0.3.0`, `0.4.0`, and `0.5.0`.
- Packed and published artifact gates: exports, declarations, size, dependency
  policy, documentation samples, and demo execution.
- `docs/ADVERSARIAL-CHECKLIST.md` for lifecycle adversity a headless engine cannot
  stage convincingly.
- `docs/SAFARI-CHECKLIST.md` on real Safari/macOS.

Safari is the one piece automation genuinely cannot produce, and it is the gap
this task was carrying implicitly. It does not disappear with this gate. It moves
to an explicit, named criterion in P6-002 and a required snapshot in P6-001, and
every checklist box in `docs/SAFARI-CHECKLIST.md` is still unchecked.

## Task

Dropped. No further work is performed under this ID. P6-001 depends on P5-002
directly.

## Acceptance criteria

- [x] The reason for dropping is recorded in this file, not only in history.
- [x] No replacement telemetry, collector, or production counter is introduced.
- [x] The Safari/macOS manual gap this task carried is re-homed explicitly in
      P6-001 and P6-002 rather than absorbed silently.
- [x] `PLAN.md` release train, dependency chain, phase gate, and index agree with
      this status, and `node v1-milestone/validate.mjs` passes.
- [x] The consumer-side collector statements in P5-001 are corrected to record the
      retirement.

## Files

This file, `PLAN.md`, `FEATURE-COMPLETE.md`, `DECISIONS.md`, `validate.mjs`,
P5-001, P6-001, and P6-002.

## Outcome

Dropped on 2026-08-30.

- `0.6.0` is removed from the release train. `0.5.0` remains the stabilization
  checkpoint and `0.7.0` becomes the next published version, built directly on it.
- The dependency chain is now `P5-001 -> P5-002 -> P6-001`.
- `validate.mjs` accepts `dropped` as a status so this record survives instead of
  being deleted to satisfy the index cross-check.
- `FEATURE-COMPLETE.md` loses its Burn-in column. Rows are now backed by
  implementation, unit, browser and documentation evidence, and its completion
  rule forbids marking a row `done` while its browser cell records a pending
  manual run -- which is what keeps the Safari row honest.
- The initial aggregate at `v1-milestone/evidence/P5-003/0.5.0-initial.json` is
  left in place as the historical record of the window that measured nothing. It
  is not evidence for any gate.
