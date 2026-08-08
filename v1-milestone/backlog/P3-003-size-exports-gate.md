---
id: P3-003
title: Gate packed exports, declarations, dependencies, and size
phase: 3
status: todo
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
- Gzip built entry points with a deterministic core budget of <= 8 KiB, or a lower
  limit if the measured baseline supports it. The budget is visible config.
- Bundle a consumer importing only `createWorkspace`; assert testing code is absent.
- Run the same script in CI and make every later publish workflow call it.

## Acceptance criteria

- [ ] ESM/CJS core and testing-subpath consumers execute from tarballs without workspace links.
- [ ] Declarations compile against declared minimum and latest TypeScript versions.
- [ ] Dependency, tarball-content, tree-shaking, and gzip checks fail under proven temporary negative tests.
- [ ] Tarballs contain intended dist, README, LICENSE, changelog, and package.json only.
- [ ] The script creates and removes only validated temporary directories.

## Files

Package/root manifests, size config, consumer/pack scripts, CI workflow, and support policy docs.

## Outcome

(pending)
