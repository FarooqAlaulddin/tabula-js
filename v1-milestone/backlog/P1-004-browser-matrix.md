---
id: P1-004
title: Run the browser matrix on the final coordination protocol
phase: 1
status: todo
depends_on: [P1-007]
owner: agent
scope: Playwright projects + CI matrix + engine-specific findings
---

## Context

The library's storage, Web Locks, focus, page lifecycle, and BroadcastChannel behavior
is engine-sensitive. Chromium-only success cannot support a Chrome/Firefox/Safari
claim. This task starts after the final Phase 1 protocol so failures are fixed once,
not independently against intermediate schemas.

Verify `docs/CONTRACT.md` sections 3-9; section 9's capability-based support floor and
eventual/best-effort boundaries are authoritative until matrix evidence adds versions.

## Task

- Add named Chromium, Firefox, and WebKit projects using the same portable suite.
- Install pinned browser revisions in CI and report each project separately.
- Fix implementation defects surfaced by an engine. Encode genuine browser-policy
  differences as narrow expectations with comments and P2-003 evidence references.
- Prohibit blanket file/project skips. Any non-portable CDP test belongs in the
  Chromium-only edge file and has a portable/manual counterpart.
- Record supported browser floors from actual required APIs and observed results.
- Prepare a dated Safari-on-macOS manual checklist; Linux WebKit is not Safari proof.

## Acceptance criteria

- [ ] The full portable suite passes on all three Playwright engines locally and in CI.
- [ ] Every skip is test-specific, justified inline, and linked to a behavior-doc item.
- [ ] Capability errors are tested where an engine/context lacks a requirement.
- [ ] CI artifacts retain traces/screenshots for retries or failures.
- [ ] Safari/macOS checklist covers leadership, state repair, presence, views, storage failure, bfcache, and focus policy.

## Files

Playwright config, CI workflow, engine-sensitive tests/fixtures, support docs, and Outcome checklist.

## Outcome

(pending)
