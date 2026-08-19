---
id: P0-002
title: Rename the package and remove the React wrapper from v1
phase: 0
status: done
depends_on: [P0-001, P0-003]
owner: agent
scope: core package identity + wrapper removal + every install/import reference
---

## Context

The workspace currently uses occupied npm names and contains a React wrapper that is
outside the maintainer-selected v1 scope. P0-001 records the permanent core name.
This task must leave one publishable package and no executable or user-facing
reference to the unavailable names or a v1 React wrapper.

## Task

- Rename the core manifest to `@thinkly/tabula-js`.
- Remove the React wrapper package from the v1 workspace and documentation.
- Refactor React-based examples to consume the framework-neutral core API directly.
- Update import specifiers in demos, examples, e2e fixtures, tests, tsconfig aliases,
  build configuration, and workspace filters.
- Update root and package README install/import examples and package tables; state
  that framework wrappers are outside the v1 surface where useful.
- Add a dated naming note to DECISIONS.md without rewriting historical decisions.
- Regenerate the lockfile through pnpm; do not hand-edit it.
- Search both quoted import forms, package JSON values, npm install commands, and
  scoped testing-subpath references before declaring completion.

## Acceptance criteria

- [x] The sole publishable package `name` exactly matches P0-001.
- [x] The React wrapper package and wrapper import aliases are absent from the v1 workspace.
- [x] `rg` finds no old install command or package import specifier outside historical decision text.
- [x] `pnpm install --frozen-lockfile`, build, typecheck, lint, unit tests, and e2e all pass.
- [x] The Excalidraw example uses the core API directly and packed README examples use only the new name.
- [x] The lockfile and all path aliases resolve without an unpublished placeholder package.

## Files

Package/workspace manifests, lockfile, TypeScript/build aliases, imports in `demo/`,
`e2e/`, `packages/`, root/package READMEs, removed wrapper files, and `DECISIONS.md`.

## Outcome

- Renamed the sole publishable package and all demo, e2e, example, documentation,
  and testing-subpath references to `@thinkly/tabula-js`.
- Removed the five tracked `packages/tabula-react` files and all wrapper aliases and
  dependencies. The Excalidraw React app now subscribes directly to core workspace
  state/events and cleans up each subscription explicitly.
- Added the dated package-boundary decision to `DECISIONS.md` without rewriting the
  historical package notes.
- Regenerated `pnpm-lock.yaml`; it now has three workspace projects and one workspace
  library link. Moved the existing build-script allowlist to pnpm 11's supported
  `pnpm-workspace.yaml#allowBuilds` setting so frozen installs run cleanly.
- Verified `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, direct
  Excalidraw TypeScript checking, `pnpm build`, 173 unit tests, and 26 Chromium e2e tests.
- React Doctor reports no issues in the changed React files. A local browser smoke
  rendered Excalidraw, changed the shared theme from light to dark, and logged no errors.
- `npm pack --dry-run --json` reports `@thinkly/tabula-js@0.1.0`; its included
  README contains only the selected package and testing-subpath names.
- Committed and pushed on `codex/v1-milestone-execution` as the P0-002 task commit.
- No unrelated working-tree changes were present when the task was completed.
