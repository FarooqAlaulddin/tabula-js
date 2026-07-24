---
id: P5-002
title: 1.0.0 gate and release
phase: 5
status: todo
depends_on: [P5-001]
owner: human
scope: gate evaluation + 1 release
---

## Context

1.0.0 is a promise of API stability and production readiness. The gate is event-based, not calendar-based.

## Gate criteria (all must hold — each with checkable evidence)

1. **Usage**: the P5-001 integration produced a dated burn-in log (the instrumentation P5-001 wired) covering at minimum: ≥20 distinct real sessions, ≥2 browsers, ≥1 session with a tab surviving a laptop sleep/wake cycle, ≥1 session with 3+ simultaneous tabs. Evidence: the log itself, linked in Outcome. Zero unexplained coordination failures in it.
2. **Issues**: the query `is:issue label:burn-in is:open` returns zero. Every closed burn-in issue is either fixed (link the commit) or accepted-and-documented (link the docs/BEHAVIOR.md section).
3. **API**: zero breaking changes since 0.2.0 — verified by diffing the exported surface (`dist/index.d.ts`) between 0.2.0 and the candidate. If any were needed, they shipped in an 0.x release and burn-in evidence (criterion 1) restarts from that release's adoption.
4. **Browsers**: the manual Safari-on-macOS pass recorded in P1-004's Outcome has been performed against 0.2.x (WebKit-on-Linux CI is not Safari). Evidence: dated checklist in Outcome.
5. **Docs**: every README and BEHAVIOR.md code sample executed against the release candidate (agent-executable: extract samples, compile/run against the packed tarball). Evidence: the run output linked in Outcome.

## Task

Human evaluates the gate. If it holds: agent prepares the 1.0.0 changeset (semver-major from 0.x), release notes summarizing the road from 0.1.0, and the maintainer merges the version PR. Announce wherever the maintainer chooses.

If the gate fails, file what failed as issues; they become new backlog items; re-evaluate after they close.

## Acceptance criteria

- [ ] Gate evaluation recorded in Outcome, criterion by criterion, with evidence links.
- [ ] Both packages at 1.0.0 on npm with provenance.
- [ ] GitHub release + notes published.
- [ ] `v1-milestone/PLAN.md` index fully `done` — milestone closed.

## Files

`.changeset/`, release notes, this backlog.

## Outcome

(pending)
