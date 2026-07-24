---
id: P0-002
title: Rename packages and all references
phase: 0
status: todo
depends_on: [P0-001, P0-003]
owner: agent
scope: ~8 files
---

## Context

The workspace packages are named `tabula` and `tabula-react` in package.json but must carry the name chosen in P0-001 to be publishable.

## Task

Rename both packages to the chosen name everywhere:

- `packages/tabula/package.json` — `name`
- `packages/tabula-react/package.json` — `name` and its dependency on the core package
- `pnpm-workspace.yaml` / root `package.json` scripts if they reference package names
- All import statements in `demo/`, `packages/example-excalidraw/`, `e2e/`, and test files (`from 'tabula'`, `from 'tabula/testing'`, `from 'tabula-react'`)
- README install commands, import samples, and the Packages table
- DECISIONS.md package-structure section (add a note; do not rewrite history)

Directory names (`packages/tabula/`) may stay as-is — only published names must change. Run `grep -rn "from 'tabula" --include='*.ts' --include='*.tsx'` to find all import sites.

## Acceptance criteria

- [ ] `grep -rn '"name": "tabula"\|"name": "tabula-react"' packages/*/package.json` returns no matches (old names gone); manual inspection confirms both `name` fields carry the P0-001 name.
- [ ] `pnpm build && pnpm typecheck && pnpm test` all green.
- [ ] `pnpm test:e2e` green.
- [ ] README contains no install/import references to the old name.

## Files

`packages/tabula/package.json`, `packages/tabula-react/package.json`, `README.md`, `DECISIONS.md`, imports across `demo/`, `e2e/`, `packages/example-excalidraw/`, `packages/tabula-react/src/`.

## Outcome

(pending)
