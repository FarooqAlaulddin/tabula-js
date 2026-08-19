---
id: P2-002
title: Deploy a semantically accurate live demo
phase: 2
status: done
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

- [x] Workflow deploys all pages and the public URL is linked from the root/package docs.
- [x] Two windows and three tabs visibly demonstrate every listed capability without unsupported claims.
- [x] View URLs, assets, refresh, and open/focus work under the Pages base path.
- [x] The production-base browser smoke passes on all three engines.
- [x] Manual deployed check and screenshots are linked in Outcome.
- [x] GitHub Pages human setup, if still required, is recorded as a concrete prerequisite.

## Files

Demo sources/config, deploy workflow, demo browser tests, and README links.

## Outcome

- The public demo is deployed at <https://farooqalaulddin.github.io/tabula-js/> from
  the packed package through the GitHub Pages workflow. Root and package documentation
  link the same URL, and direct requests to the dashboard, editor, preview, and settings
  routes return successfully under the `/tabula-js/` base path.
- GitHub Actions run [31879880540](https://github.com/FarooqAlaulddin/tabula-js/actions/runs/31879880540)
  passed the production-base demo suite, deployed the tested artifact, and then passed
  the deployed smoke suite on Chromium, Firefox, and WebKit. The run also passed lint,
  build, typecheck, unit, portable E2E, packed-package, and compatibility jobs.
- A manual deployed check opened the exclusive editor and read-only preview, entered
  content in the editor, and observed the dashboard and preview mirror it. The dashboard
  reported the editor claim, both connected tabs, active leader work, and no editable
  control in the preview.
- Retained deployed-run screenshots: [Chromium](../evidence/P2-002/chromium.png),
  [Firefox](../evidence/P2-002/firefox.png), and
  [WebKit](../evidence/P2-002/webkit.png).
- The repository is public, Pages uses GitHub Actions with HTTPS enforcement, and the
  `github-pages` environment allows `main` plus the milestone branch used for this
  verification. No remaining human Pages setup prerequisite blocks this gate.
- A post-gate demo enhancement adds a default app-level split mode: the dashboard tab
  itself atomically claims and releases one named view while showing its working
  surface beside the dashboard. A segmented control retains the separate-tab path for
  `open()`/focus and multi-tab evidence; the demo does not claim browser-native split
  control or iframe support. The production-base Playwright suite covers both modes.
