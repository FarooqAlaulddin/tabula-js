---
id: P0-003
title: Correct and commit the pending e2e work
phase: 0
status: todo
depends_on: []
owner: agent
scope: current 5-file diff + fixture instrumentation needed to make assertions direct
---

## Context

Five files contain uncommitted e2e changes. Review found that several test names
currently overclaim their assertions: leader cleanup is inferred from a replacement
leader incrementing; the same-page rejoin test reloads; and the focus test only
checks that a view remains registered. The package script also uses `npx`, which may
resolve tooling outside the pnpm lockfile.

## Task

- Replace `npx playwright` with `pnpm exec playwright`.
- Instrument the fixture so leader setup and cleanup invocations are directly observable.
- Make the rejoin test either create a second workspace in the same document and prove
  teardown isolation, or rename it honestly if reload is the intended behavior.
- Instrument or otherwise directly observe receipt of `view:focus`/`window.focus`;
  do not treat an intact view registry as proof of focus delivery.
- Retain the useful `view:conflict` coverage and review all modified assertions for
  deterministic cleanup.
- Install the repository-pinned Playwright browsers if needed, run the suite, then
  commit only this coherent task and push the selected integration branch.

## Acceptance criteria

- [ ] Every new test directly observes the behavior named in its title.
- [ ] No dead code, unused evaluation callback, or comment describing an assertion that is absent.
- [ ] `pnpm test:e2e` passes with the lockfile-pinned Playwright executable.
- [ ] Unit, typecheck, and lint remain green.
- [ ] The five-file starting diff plus justified fixture changes are committed and pushed.
- [ ] Unrelated working-tree changes remain untouched and are listed in Outcome if present.

## Files

`e2e/fixtures/index.html`, `e2e/tests/leader.spec.ts`,
`e2e/tests/presence.spec.ts`, `e2e/tests/views.spec.ts`, root `package.json`, and
fixture/helper files strictly required for direct instrumentation.

## Outcome

(pending)
