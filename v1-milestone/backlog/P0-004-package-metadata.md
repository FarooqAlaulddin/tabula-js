---
id: P0-004
title: Complete package metadata for publishing
phase: 0
status: todo
depends_on: [P0-003]
owner: agent
scope: 2 files + tarball verification
---

## Context

Current state (verified 2026-07-23 — re-verify before starting): both `packages/tabula/package.json` and `packages/tabula-react/package.json` **already have** `files: ["dist"]` and `sideEffects: false`, and the core package already has a `keywords` array. What's actually missing: `repository`, `homepage`, and `bugs` in both; `keywords` in the react package. Both packages have per-package READMEs; only the repo root has a LICENSE, so packed tarballs may lack one. npm provenance publishing (P3-001) requires a `repository` field matching the GitHub repo.

## Task

- Add to both package.jsons: `repository` (`{ "type": "git", "url": "git+https://github.com/FarooqAlaulddin/tabula-js.git", "directory": "packages/<dir>" }`), `homepage`, `bugs`.
- React package: add `keywords`; core package: reconcile the prescribed set (browser-tabs, broadcastchannel, multi-tab, cross-tab, leader-election, presence, workspace, tab-coordination) with the existing list — merge, don't blindly replace.
- Decide how LICENSE reaches each tarball: per-package copies added to `files`, or `license` field only. Implement the choice.
- Add `packageManager` field to the root package.json (pin pnpm) for reproducible release builds.
- Verify each per-package README has package-specific install and import samples (update if they still reference old names post-P0-002 — coordinate if P0-002 hasn't run yet; this task must not undo it).

## Acceptance criteria

- [ ] `npm pack --dry-run` in each package lists dist + README + LICENSE (per chosen mechanism) + package.json, nothing else.
- [ ] Both packages have `repository` (with `directory`), `homepage`, `bugs`, `keywords`.
- [ ] Root package.json has `packageManager`.
- [ ] `pnpm build && pnpm typecheck` green.

## Files

`packages/tabula/package.json`, `packages/tabula-react/package.json`, root `package.json`, possibly `packages/*/LICENSE`, `packages/*/README.md`.

## Outcome

(pending)
