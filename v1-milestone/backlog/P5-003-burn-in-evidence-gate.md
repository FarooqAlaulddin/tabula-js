---
id: P5-003
title: Close the burn-in evidence gate
phase: 5
status: todo
depends_on: [P5-002]
owner: human
scope: evidence audit against the final 0.x candidate
---

## Context

The final burn-in window begins only after the last evidence-resetting release is
installed everywhere. Session count alone is insufficient; the evidence must show
that each public capability and adverse lifecycle path actually occurred.

## Gate criteria

All evidence must come from the same final `0.x` candidate or a protocol/API-identical
patch and must be linked in Outcome:

1. At least 100 distinct workspace sessions, including 30 with 2+ simultaneous tabs
   and 10 with 3+ tabs.
2. Chromium, Firefox, and Safari/macOS represented; at least two OS families represented.
3. At least 20 normal-path sessions each exercising shared state, leadership, and
   named-view ownership; presence is recorded for every multi-tab session.
4. At least 10 sleep/wake survivals, 10 refresh/rejoin sequences including opened
   children, 5 bfcache restores, and 5 sessions spanning an application deployment.
5. At least 5 directly observed leader transfers and 10 view vacancy/reclaim cycles.
6. Zero unexplained invariant violations, permanent sync repairs, overlapping leader
   intervals, duplicate valid view owners, ghost tabs/views, unhandled protocol errors,
   or open burn-in issues.
7. Every FEATURE-COMPLETE burn-in cell is done with versioned evidence.

Evidence may be aggregated/anonymized, but collection definitions and exclusion rules
must be reviewable. Synthetic repository demos do not count.

## Task

The maintainer evaluates every gate criterion against the final candidate's frozen
evidence window. The agent prepares reproducible aggregate queries, verifies version
and traffic exclusions, links FEATURE-COMPLETE rows, and reports discrepancies. A
failed criterion returns to P5-002 with an issue and a new evidence-reset boundary.

## Acceptance criteria

- [ ] Human records pass/fail for each criterion with source, query, version, and date.
- [ ] Agent independently checks aggregates against raw/anonymized records where access permits.
- [ ] No counter includes pre-reset releases or hidden test/demo traffic.
- [ ] Any failure returns to P5-002 with a filed issue; it is not waived inside this task.
- [ ] Passing evidence is frozen for P6-001 and linked from FEATURE-COMPLETE.

## Files

This Outcome, FEATURE-COMPLETE evidence links, external evidence location, and issue tracker.

## Outcome

(pending)
