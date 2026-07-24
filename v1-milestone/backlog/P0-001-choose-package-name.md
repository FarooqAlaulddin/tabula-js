---
id: P0-001
title: Choose the npm package name
phase: 0
status: todo
depends_on: []
owner: human
scope: 1 decision
---

## Context

`tabula` is taken on npm (a table-printing lib, v1.10.0) and `tabula-js` is taken (v1.0.1, a PDF-extraction wrapper that also dominates search results for the name). `tabula-react` is free but useless without the core. `@tabula/core` returns 404 but the `@tabula` org scope may not be claimable. Publishing is impossible until this is decided.

## Task

Maintainer decides between:

1. **Own scope**: `@<npm-username>/tabula` + `@<npm-username>/tabula-react`. Always available, weakest discoverability.
2. **Claim an org scope**: try to register `tabula` org on npm → `@tabula/core`, `@tabula/react`. Best branding if available.
3. **New unscoped name**: e.g. `tabulajs` variants or a different word entirely. Check availability before committing.

Agent preparation allowed: check npm availability for a candidate shortlist (`npm view <name> version` — E404 means free; for org scopes check https://www.npmjs.com/org/<name>) and record results below.

## Acceptance criteria

- [ ] A name is written in the `## Outcome` section by the maintainer.
- [ ] `npm view` confirms the chosen name (or scope) is available at decision time.

## Files

None (decision only). P0-002 executes it.

## Outcome

(pending)
