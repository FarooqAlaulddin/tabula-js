---
id: P0-001
title: Choose the npm package names
phase: 0
status: todo
depends_on: []
owner: human
scope: 2 names + ownership decision
---

## Context

`tabula` and `tabula-js` are already occupied on npm. Both the core and React
package need names that can be owned together for the life of the project. The
choice affects imports, searchability, trusted-publisher configuration, and the
permanent 1.0 API identity.

## Task

The maintainer chooses one naming family:

1. An owned personal scope: `@<owner>/tabula` and `@<owner>/tabula-react`.
2. An owned organization scope: preferably `<scope>/core` and `<scope>/react`.
3. Two coordinated unscoped names whose ownership and search results are acceptable.

Agent preparation may check npm availability, GitHub/repository collisions, basic
web-search ambiguity, and whether the npm account or organization can configure
trusted publishing. Record the exact core package, React package, import examples,
scope owner, and availability timestamp in Outcome.

## Acceptance criteria

- [ ] Exact core and React names are recorded in Outcome by the maintainer.
- [ ] `npm view` confirms both names are available or already controlled by the maintainer.
- [ ] The relevant npm account/scope can configure trusted publishing for this repository.
- [ ] The chosen names do not misleadingly impersonate an unrelated active project.

## Files

This decision file only. P0-002 performs the rename.

## Outcome

(pending)
