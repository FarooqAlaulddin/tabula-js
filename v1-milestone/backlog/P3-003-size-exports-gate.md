---
id: P3-003
title: Bundle size and exports regression gate
phase: 3
status: todo
depends_on: [P0-002]
owner: agent
scope: 1 CI check + 1 smoke-test script
---

## Context

The README advertises ~7 KB gzipped core / ~1 KB react, and zero dependencies is the identity. Nothing currently fails CI if a change doubles the bundle, adds a dependency, breaks tree-shaking, or breaks the `./testing` subpath export for CJS consumers. `npm pack --dry-run` doesn't catch any of these.

## Task

- Add a size check (size-limit or a script gzipping `dist/index.js`) with budgets: core ≤ 8 KB gzip, react ≤ 2 KB gzip — failing CI on breach. Budgets live in package.json so raising one is a visible, reviewed diff.
- Add a dependency-count assertion: core `dependencies` must be absent/empty; react may depend only on the core package (peer: react).
- Consumer smoke test in CI, from packed tarballs (`npm pack`, install into a temp project): ESM `import` and CJS `require` of both `.` and `./testing`; tsc consuming the emitted `.d.ts`/`.d.cts` in that temp project.
- Tree-shaking smoke: bundle a file importing only `createWorkspace` with esbuild; assert testing-only symbols (e.g. `createTestCluster`) are absent from output.

## Acceptance criteria

- [ ] CI job fails when a budget is exceeded (prove by temporarily inflating, then revert).
- [ ] Smoke test passes for ESM+CJS × core+testing+react from packed tarballs.
- [ ] Tree-shake assertion green.
- [ ] Budgets recorded in package.json (or size-limit config), visible in diffs.

## Files

`.github/workflows/ci.yml`, `package.json` / size-limit config, `scripts/` smoke-test script (new).

## Outcome

(pending)
