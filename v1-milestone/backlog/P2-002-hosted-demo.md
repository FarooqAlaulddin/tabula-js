---
id: P2-002
title: Deploy a semantically accurate live demo
phase: 2
status: in-progress
depends_on: [P1-003]
owner: agent
scope: multi-page demo + Pages workflow + browser smoke
---

## Context

A hosted multi-tab demonstration is the fastest way to evaluate Tabula, but it must
teach the real contract. The demo should show one editor view feeding a mirrored
preview, shared UI hints, presence, and one leader-owned background task. It must not
present LWW state as collaborative document editing.

## Task

- Configure every demo HTML entry as a Vite build input and make routes work under the
  GitHub Pages repository base path.
- Deploy through GitHub Actions from a tested packed/built package artifact.
- Demonstrate: open/focus an exclusive editor view, read-only preview, theme/logout UI
  state, tab presence, leader identity/work handoff, conflict, vacancy, and recovery.
- Show concise runtime status and an invitation to open a second tab. Do not add a
  marketing landing page or visible implementation tutorial.
- Remove or redesign any demo/example interaction that permits two apparent editors
  to concurrently overwrite a document body.
- Add Playwright smoke coverage against the production-base build and deployed URL.

## Acceptance criteria

- [ ] Workflow deploys all pages and the public URL is linked from the root/package docs.
- [ ] Two windows and three tabs visibly demonstrate every listed capability without unsupported claims.
- [ ] View URLs, assets, refresh, and open/focus work under the Pages base path.
- [ ] The production-base browser smoke passes on all three engines.
- [ ] Manual deployed check and screenshots are linked in Outcome.
- [ ] GitHub Pages human setup, if still required, is recorded as a concrete prerequisite.

## Files

Demo sources/config, deploy workflow, demo browser tests, and README links.

## Outcome

(pending)
