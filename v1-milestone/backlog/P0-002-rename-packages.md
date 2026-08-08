---
id: P0-002
title: Rename packages and all references
phase: 0
status: todo
depends_on: [P0-001, P0-003]
owner: agent
scope: package manifests + every install/import reference
---

## Context

The workspace currently uses occupied npm names. P0-001 records the permanent
published names. This task must leave no executable or user-facing reference using
the unavailable names as package specifiers.

## Task

- Rename both package manifests and the React core peer/development dependency.
- Update import specifiers in demos, examples, e2e fixtures, React bindings, tests,
  tsconfig aliases, build configuration, and workspace filters.
- Update root and package README install/import examples and package tables.
- Add a dated naming note to DECISIONS.md without rewriting historical decisions.
- Regenerate the lockfile through pnpm; do not hand-edit it.
- Search both quoted import forms, package JSON values, npm install commands, and
  scoped testing-subpath references before declaring completion.

## Acceptance criteria

- [ ] Both package `name` fields exactly match P0-001 and React references the renamed core.
- [ ] `rg` finds no old install command or import specifier outside historical Outcome text.
- [ ] `pnpm install --frozen-lockfile`, build, typecheck, lint, unit tests, and e2e all pass.
- [ ] Packed package README examples contain only the new names.
- [ ] The lockfile and all path aliases resolve without unpublished placeholder packages.

## Files

Package manifests, lockfile, TypeScript/build aliases, imports in `demo/`, `e2e/`,
`packages/`, root/package READMEs, and `DECISIONS.md`.

## Outcome

(pending)
