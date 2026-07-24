---
id: P2-002
title: Deploy live demo
phase: 2
status: todo
depends_on: [P0-002]
owner: agent
scope: 1 workflow file + demo polish + README link
---

## Context

Nobody clones a repo to evaluate a coordination library. A hosted page where a visitor opens two tabs and watches state/presence/leadership sync is the highest-leverage asset for adoption. The `demo/` Vite app exists but isn't deployed.

## Task

- Add a GitHub Actions workflow (`.github/workflows/deploy-demo.yml`) that builds `demo/` and deploys to GitHub Pages on push to main.
- **The demo is multi-page** (`index.html` plus view pages like `editor.html`/`preview.html`/`settings.html`): configure every HTML file as a Rollup input in `demo/vite.config.ts` (`build.rollupOptions.input`) — Vite's default builds only `index.html`.
- Set `base` for project pages and verify the built `dist/` works under the repo subpath (serve locally at a matching subpath and click through with two tabs; BroadcastChannel + localStorage are origin-scoped, so Pages is fine). Check `open()` view URLs respect the base path.
- Human prerequisite (record in Outcome, does not block writing the workflow): enable GitHub Pages with "GitHub Actions" as the source in repo settings.
- Polish pass on the demo UI only if it fails to demonstrate: shared state, presence list, leader badge, view claim/focus. Add an on-page hint: "Open this page in a second tab."
- Add the live link at the top of README (badge or bold link under the tagline).

Note: origin-scoped means each visitor's tabs coordinate only with their own tabs — that's the point; no backend needed.

## Acceptance criteria

- [ ] Workflow green on main; demo reachable at the Pages URL.
- [ ] Two tabs of the deployed demo visibly sync state and show correct leader/presence (manual check, screenshot in Outcome).
- [ ] `open()`/view URLs work under the Pages base path.
- [ ] README links to the live demo.

## Files

`.github/workflows/deploy-demo.yml` (new), `demo/vite.config.ts`, possibly `demo/` sources, `README.md`.

## Outcome

(pending)
