---
id: P0-003
title: Commit pending e2e work
phase: 0
status: todo
depends_on: []
owner: agent
scope: 5 files, 1 commit
---

## Context

Five files are modified but uncommitted: `e2e/fixtures/index.html`, `e2e/tests/leader.spec.ts`, `e2e/tests/presence.spec.ts`, `e2e/tests/views.spec.ts`, `package.json`. The full e2e suite passes with these changes (verified 2026-07-23: 26/26).

## Task

Review the diff, confirm the changes are coherent (they appear to be e2e test improvements), commit with a descriptive message, and push.

## Acceptance criteria

- [ ] `git status` clean (excluding `v1-milestone/` while it's being authored).
- [ ] `pnpm test:e2e` green at the committed revision.
- [ ] Pushed to origin/main.

## Files

The five modified files above.

## Outcome

(pending)
