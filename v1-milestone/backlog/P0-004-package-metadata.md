---
id: P0-004
title: Complete package metadata and declared prerequisites
phase: 0
status: done
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

- Add repository metadata with package directory, homepage, bugs, keywords,
  `publishConfig`, and the chosen Node/TypeScript declarations where already decided.
- Pin the root `packageManager` and document the supported package manager for releases.
- Put LICENSE in the tarball and verify README selection for npm.
- Add a short prerequisites section to the package README using the renamed package.
- Run `npm pack --dry-run` and inspect the exact file list.

## Acceptance criteria

- [x] The package contains repository, homepage, bugs, keywords, license, and publish access metadata.
- [x] Root `packageManager` pins the repository pnpm major and exact version.
- [x] The dry-run tarball contains only package.json, README, LICENSE, changelog if present, and intended dist files.
- [x] Package docs state secure-context, storage, browser, same-origin, and top-level-context prerequisites without claiming unsupported versions.
- [x] Build, typecheck, and packed dry runs pass.

## Files

Root/package manifests, package README, and package LICENSE file as needed.

## Outcome

- Added npm metadata for the exact GitHub repository/package directory, homepage,
  issue tracker, public publish access, license, and expanded discovery keywords.
- Pinned the repository and release package manager to `pnpm@11.5.0` and documented
  frozen-install release usage in the root README.
- Added a package-local LICENSE byte-identical to the root MIT license and explicitly
  included LICENSE, README, and dist in the package file allowlist.
- Replaced inferred browser-version claims in root/npm READMEs with the actual v1
  prerequisites: top-level same-origin contexts, secure context plus Web Locks,
  BroadcastChannel, `crypto.randomUUID()`, and usable local/session storage.
- `npm pack --dry-run --json` produced `@farooqalaulddin/tabula-js@0.1.0` with exactly
  15 entries: LICENSE, README, package.json, and 12 intended dist files.
- Verified LICENSE equality, `pnpm install --frozen-lockfile`, lint, typecheck, build,
  milestone validation, and package metadata inspection.
- Committed and pushed on `codex/v1-milestone-execution` as the P0-004 task commit.
- No unrelated working-tree changes were present when the task was completed.
