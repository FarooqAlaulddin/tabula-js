---
id: P3-002
title: Adopt changesets and seed CHANGELOG
phase: 3
status: todo
depends_on: [P0-002]
owner: agent
scope: changesets init + 2 files
---

## Context

Version bumps and changelogs should be mechanical from here to 1.0.0. Changesets is the standard for pnpm monorepos and keeps the two packages' versions coordinated. **Decision recorded here so P3-001 doesn't have to guess: changesets IS the release model** — version PRs on main, publish on merge. P3-001 builds the workflow around it; this task runs first.

## Task

- `pnpm add -Dw @changesets/cli && pnpm changeset init`; configure `fixed` versioning for the two packages so core and react release in lockstep.
- Add root `package.json` scripts: `"version": "changeset version"`, `"release": "pnpm build && changeset publish"` (P3-001's workflow consumes these).
- Seed the core package's `CHANGELOG.md` with a `0.1.0` entry summarizing what exists (from DECISIONS.md), so 0.2.0's entry has a baseline.
- The standing rule in PLAN.md ("user-facing change = changeset in the same PR") activates when this task is done — note it in Outcome.

## Acceptance criteria

- [ ] `.changeset/config.json` present with `fixed` grouping of the two packages.
- [ ] `pnpm changeset status` runs without error.
- [ ] Root scripts `version`/`release` present.
- [ ] CHANGELOG.md baseline entry exists.

## Files

`.changeset/` (new), `packages/tabula/CHANGELOG.md` (new), root `package.json`.

## Outcome

(pending)
