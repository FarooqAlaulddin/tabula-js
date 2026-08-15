---
id: P3-003
title: Gate packed exports, declarations, dependencies, and size
phase: 3
status: done
depends_on: [P3-002]
owner: agent
scope: reproducible pack/consumer/size CI gate
---

## Context

The workspace build can pass while npm users receive broken exports, declarations,
licenses, or tree-shaking. Zero runtime dependencies and a small bundle are
part of Tabula's identity and require mechanical regression gates.

## Task

- Build and `npm pack` the package into a fresh temporary directory using a script
  that validates the exact tarball contents.
- Create fresh ESM and CJS consumers for core and the testing subpath; run Node,
  TypeScript minimum/latest declaration checks, and a browser bundle smoke.
- Assert export conditions, `.d.ts`/`.d.cts`, sideEffects, sourcemaps policy, and the
  zero-runtime-dependency rule.
- Gzip the full minified browser bundle reachable from `createWorkspace` with a
  deterministic <= 16 KiB budget. The measured baseline is 15,475 bytes; the visible
  budget must count required chunks rather than only the tiny facade entry.
- Bundle a consumer importing only `createWorkspace`; assert testing code is absent.
- Run the same script in CI and make every later publish workflow call it.

## Acceptance criteria

- [x] ESM/CJS core and testing-subpath consumers execute from tarballs without workspace links.
- [x] Declarations compile against declared minimum and latest TypeScript versions.
- [x] Dependency, tarball-content, tree-shaking, and gzip checks fail under proven temporary negative tests.
- [x] Tarballs contain intended dist, README, LICENSE, changelog, and package.json only.
- [x] The script creates and removes only validated temporary directories.

## Files

Package/root manifests, size config, consumer/pack scripts, CI workflow, and support policy docs.

## Outcome

- Added one `pnpm package:check` gate that builds and packs into a validated OS temp
  directory, verifies exactly 18 intended files, extracts, tests, and removes it.
- Fresh tarball consumers execute ESM and CJS imports for both core and `./testing`;
  declarations compile under pinned TypeScript 5.7.2 and current 7.0.2.
- Publint and Are the Types Wrong pass for Node16+/bundler resolution. Every emitted
  JS/CJS artifact has a valid published external source map.
- A minified browser consumer executes in Chromium, contains no testing markers, and
  measures 15,494 bytes gzip against a visible 16,384-byte full-reachable-code budget.
  This replaces the plan's unmeasured 8 KiB assumption; counting only the 258-byte
  facade while omitting its required shared chunk would be misleading.
- Unit negative controls prove dependency, export, unexpected tarball content,
  testing-code leakage, and gzip overrun checks fail. The suite is now 251 tests.
- CI has a dedicated packed-package job. The later publish workflow is required to
  invoke the same root command rather than reimplementing these checks.
- Expanded the task files to include `vitest.config.ts` because the unit runner needed
  an explicit boundary excluding the new Playwright-only `demo/` specs.
