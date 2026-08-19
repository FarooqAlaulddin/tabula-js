---
id: P0-001
title: Choose the npm package name
phase: 0
status: done
depends_on: []
owner: human
scope: one package name + ownership decision
---

## Context

`tabula` and `tabula-js` are already occupied on npm. The v1 core package needs a
name that can be owned for the life of the project. The choice affects imports,
searchability, trusted-publisher configuration, and the permanent 1.0 API identity.
The maintainer has explicitly deferred a React wrapper until after v1.

## Task

The maintainer chooses one package name:

1. A package in an owned personal scope.
2. A package in an owned organization scope.
3. An unscoped name whose ownership and search results are acceptable.

Agent preparation may check npm availability, GitHub/repository collisions, basic
web-search ambiguity, and whether the npm account or organization can configure
trusted publishing. Record the exact package, import examples, scope owner, and
availability timestamp in Outcome.

## Acceptance criteria

- [x] The exact v1 package name is recorded in Outcome by the maintainer.
- [x] `npm view` confirms the name is available or already controlled by the maintainer.
- [x] Trusted-publishing prerequisites for the selected scope and repository are recorded.
- [x] The chosen name does not misleadingly impersonate an unrelated active project.

## Files

This decision file plus the master plan, feature matrix, and downstream task
contracts that previously required a React package. P0-002 performs the codebase
rename and wrapper removal.

## Outcome

Maintainer decision recorded on `2026-08-08` and revised to the existing
organization scope on `2026-08-19`:

- The sole v1 package is `@thinkly/tabula-js`, under the maintainer's
  npm organization scope. The React wrapper is deferred until after v1.
- Public imports are `@thinkly/tabula-js` and
  `@thinkly/tabula-js/testing`.
- `npm access list packages thinkly --json` returned `{}` and
  `npm view @thinkly/tabula-js` returned `E404` at
  `2026-08-19T09:03:53Z`. Availability must be rechecked immediately before the
  first publish because a registry lookup cannot reserve a name.
- The unscoped `tabula` and `tabula-js` packages belong to unrelated projects;
  the selected organization scope avoids impersonating either one.
- npm's trusted-publisher documentation supports GitHub-hosted Actions and requires
  Node 22.14+ with npm 11.5.1+. P3-001 must pin a compliant release runtime.
- The GitHub repository is currently private. npm permits trusted publishing, but
  provenance is unavailable for a private source repository; it must be made public
  before the first provenance-gated release in P4-002.
- Local `npm whoami` returns `falaulddin`, and the `thinkly` organization scope is
  visible to that account. Creating or claiming the package and attaching the
  trusted publisher remain explicit human setup in P4-002.
- The maintainer's no-wrapper decision changed the v1 product boundary, so this task
  also removed React-package obligations from all downstream milestone gates.

References: [trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).
