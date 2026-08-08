---
id: P6-002
title: Approve the final 1.0 gate
phase: 6
status: todo
depends_on: [P6-001]
owner: human
scope: criterion-by-criterion release approval
---

## Context

This is the maintainer's explicit acceptance of the long-term 1.0 compatibility and
support promise. Passing CI alone cannot make that product decision.

## Gate criteria

- Product scope and non-goals remain acceptable as the stable 1.0 identity.
- I1-I10 and every FEATURE-COMPLETE row have current RC evidence.
- Public API, package exports, protocol compatibility policy, support floors, defaults,
  and errors are acceptable to maintain under semantic versioning.
- P5-003 burn-in evidence applies unchanged to the RC behavior.
- P6-001 automated/manual/package/Safari/upgrade results are green.
- No open issue is labeled correctness, burn-in, release-blocker, or security.
- npm ownership, trusted publishing, GitHub environment protections, Pages demo, and
  recovery access are under maintainer control.
- Final release notes state guarantees, limitations, migration from previews, and
  security/trust boundaries without overclaiming.

## Task

The maintainer reviews the frozen RC evidence and records an explicit decision for
every criterion. The agent prepares the API/protocol/artifact comparisons, issue
queries, ownership checklist, and final notes. Any failed criterion returns to its
owning phase; this task cannot waive or edit the underlying requirement.

## Acceptance criteria

- [ ] Maintainer records pass/fail and evidence link for every gate criterion.
- [ ] Any failed criterion files an issue and returns to the owning phase.
- [ ] The exact approved RC number, commit, manifests, and package hashes are recorded.
- [ ] Approval explicitly authorizes P7-001 to publish `1.0.0` and move `latest`.

## Files

This Outcome and final release-note approval.

## Outcome

(pending)
