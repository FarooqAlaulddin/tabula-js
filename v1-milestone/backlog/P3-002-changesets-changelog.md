---
id: P3-002
title: Adopt changesets and seed changelogs
phase: 3
status: done
depends_on: [P0-004]
owner: agent
scope: version policy + changelogs + release scripts
---

## Context

The single v1 package needs mechanical version changes, changelogs, prerelease mode,
and dist-tags before the first npm artifact exists.

## Task

- Add and initialize Changesets for the core package.
- Configure public access and document `next` as the only pre-1.0 dist-tag.
- Add root scripts for changeset creation/status/version/publish without embedding
  credentials or bypassing normal build/test gates.
- Seed the package changelog with the unpublished `0.1.0` source baseline and a note
  that its occupied package names were never released.
- Document prerelease entry/exit steps for `0.2.0-alpha` and normal `0.x` evidence checkpoints.
- Activate the standing rule that every user-visible change carries a changeset.

## Acceptance criteria

- [x] Package access policy, base branch, and ignored private packages are correct.
- [x] `pnpm changeset status` passes from a clean tree.
- [x] A temporary dry version exercise updates the package correctly, then is reverted without destructive git operations.
- [x] The changelog accurately describes the baseline and publication status.
- [x] Release scripts use repository-pinned tools and no `npx` fallback.

## Files

`.changeset/`, root/package manifests, package changelog, and release documentation.

## Outcome

- Pinned `@changesets/cli@3.0.0` in the root lockfile and configured public access,
  `main` as the base branch, and the private Excalidraw package as ignored.
- Added repository-pinned create/status/version/prerelease/publish scripts; every
  pre-1.0 publish uses the explicit `next` dist-tag.
- Seeded the unpublished `0.1.0` source-baseline changelog and a pending minor
  changeset describing the hardened `0.2.0` technical preview.
- Documented alpha, normal `0.x`, prerelease exit, and milestone-promotion
  procedures in `docs/RELEASING.md`.
- `pnpm changeset:status`, lint, and frozen install pass. An isolated temporary copy
  versioned to `0.2.0`, updated `CHANGELOG.md`, consumed its changeset, and was then
  removed through validated temporary-path cleanup without modifying source files.
