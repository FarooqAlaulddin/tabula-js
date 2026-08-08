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

Core and React form one product and must move through the preview train together.
Version changes, dependency ranges, changelogs, prerelease mode, and dist-tags should
be mechanical before the first npm artifact exists.

## Task

- Add and initialize Changesets with fixed versioning for core and React.
- Configure public access and document `next` as the only pre-1.0 dist-tag.
- Add root scripts for changeset creation/status/version/publish without embedding
  credentials or bypassing normal build/test gates.
- Seed both package changelogs with the unpublished `0.1.0` source baseline and a note
  that its occupied package names were never released.
- Document prerelease entry/exit steps for `0.2.0-alpha`, normal `0.x`, and `1.0.0-rc`.
- Activate the standing rule that every user-visible change carries a changeset.

## Acceptance criteria

- [ ] Fixed package group, access policy, base branch, and ignored private packages are correct.
- [ ] `pnpm changeset status` passes from a clean tree.
- [ ] A temporary dry version exercise updates both packages and the React core range correctly, then is reverted without destructive git operations.
- [ ] Both changelogs accurately describe the baseline and publication status.
- [ ] Release scripts use repository-pinned tools and no `npx` fallback.

## Files

`.changeset/`, root/package manifests, both package changelogs, and release documentation.

## Outcome

(pending)
