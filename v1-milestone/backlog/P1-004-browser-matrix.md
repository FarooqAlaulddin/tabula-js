---
id: P1-004
title: Browser test matrix — Firefox and WebKit
phase: 1
status: todo
depends_on: [P0-002]
owner: agent
scope: playwright config + CI workflow + fixing whatever it surfaces
---

## Context

CI currently installs and runs Chromium only, while the library claims Chrome/Firefox/Safari support — and its most browser-sensitive machinery (Web Locks after P1-001, storage events, BroadcastChannel timing, focus behavior) is exactly where engines differ. No stability claim is credible tested on one engine.

## Task

- Add `firefox` and `webkit` projects to `e2e/playwright.config.ts`.
- Update `.github/workflows/ci.yml` to install all three browsers (`playwright install --with-deps chromium firefox webkit`) and run the full e2e suite on each (matrix or sequential).
- Fix any real failures surfaced (likely candidates: storage-event timing, focus assertions in views specs, timing tolerances). Behavior differences that are engine policy, not bugs, get documented for P2-003 and the spec adjusted with an engine-specific expectation, never blanket-skipped without a comment explaining why.
- Add a note to the README browser-support section if testing reveals a floor different from the documented one.
- WebKit-on-Linux is not Safari: record in this task's Outcome that a manual Safari-on-macOS pass is required before 1.0 (referenced by P5-002 criterion 4).

## Acceptance criteria

- [ ] `npx playwright test --config e2e/playwright.config.ts` green locally on all three projects.
- [ ] CI runs and passes all three engines on main.
- [ ] Any engine-specific skips carry an inline comment with the reason and a P2-003 reference.

## Files

`e2e/playwright.config.ts`, `.github/workflows/ci.yml`, possibly `e2e/tests/*.spec.ts` fixes.

## Outcome

(pending)
