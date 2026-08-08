---
id: P0-004
title: Complete package metadata and declared prerequisites
phase: 0
status: todo
depends_on: [P0-002]
owner: agent
scope: manifests + package contents + prerequisite documentation
---

## Context

The package manifests lack repository, homepage, bugs, and complete keyword metadata.
Published tarballs must contain their licenses and must state the browser/runtime
prerequisites that later hardening will enforce: top-level same-origin contexts,
secure context for Web Locks, BroadcastChannel, usable local/session storage, and
`crypto.randomUUID()`.

## Task

- Add repository metadata with package directories, homepage, bugs, keywords,
  `publishConfig`, and the chosen Node/TypeScript/React declarations where already decided.
- Pin the root `packageManager` and document the supported package manager for releases.
- Put LICENSE in both tarballs and verify README selection for npm.
- Add a short prerequisites section to each package README using the renamed packages.
- Run `npm pack --dry-run` and inspect the exact file list for each package.

## Acceptance criteria

- [ ] Both packages contain repository, homepage, bugs, keywords, license, and publish access metadata.
- [ ] Root `packageManager` pins the repository pnpm major and exact version.
- [ ] Each dry-run tarball contains only package.json, README, LICENSE, changelog if present, and intended dist files.
- [ ] Package docs state secure-context, storage, browser, same-origin, and top-level-context prerequisites without claiming unsupported versions.
- [ ] Build, typecheck, and packed dry runs pass.

## Files

Root/package manifests, package READMEs, and per-package LICENSE files as needed.

## Outcome

(pending)
