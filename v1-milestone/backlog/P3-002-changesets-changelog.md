---
id: P3-002
title: Adopt changesets and seed changelogs
phase: 3
status: todo
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
- Document prerelease entry/exit steps for `0.2.0-alpha`, normal `0.x`, and `1.0.0-rc`.
- Activate the standing rule that every user-visible change carries a changeset.

## Acceptance criteria

- [ ] Package access policy, base branch, and ignored private packages are correct.
- [ ] `pnpm changeset status` passes from a clean tree.
- [ ] A temporary dry version exercise updates the package correctly, then is reverted without destructive git operations.
- [ ] The changelog accurately describes the baseline and publication status.
- [ ] Release scripts use repository-pinned tools and no `npx` fallback.

## Files

`.changeset/`, root/package manifests, package changelog, and release documentation.

## Outcome

(pending)
