---
id: P2-004
title: Align npm package documentation and executable examples
phase: 2
status: done
depends_on: [P2-001, P2-002, P2-003]
owner: agent
scope: root/package docs + example semantic audit + sample harness
---

## Context

npm renders package-level READMEs, not the repository README. Those documents must
carry the same prerequisites, guarantees, security boundaries, API surface, and
non-goals. Every code sample must compile against what users actually install.

## Task

- Reconcile root and package documentation from CONTRACT and BEHAVIOR without
  maintaining contradictory prose.
- Include install commands, quick starts, full public API links, prerequisites,
  lifecycle/error guidance, security/trust model, and alternatives where appropriate.
- Audit demo and Excalidraw code. Make editing single-owner or clearly non-concurrent;
  prove that React applications can use the core API without a framework wrapper.
- Build a sample extractor/harness that compiles TypeScript/TSX blocks against the
  packed package. Execute browser-dependent samples in a fixture using that artifact.
- Verify direct React integration, testing-subpath examples, ESM/CJS examples, and
  the package name independently of workspace aliases.

## Acceptance criteria

- [x] npm-visible READMEs state the same support and behavioral contract as root docs.
- [x] Every public symbol has one canonical documented reference; nothing internal is advertised.
- [x] All executable code blocks compile against packed tarballs and browser examples run.
- [x] Excalidraw/demo behavior does not contradict the LWW/document non-goal.
- [x] Broken relative links are detected in CI or by a documented link check.

## Files

Root/package READMEs, examples, sample extraction/test harness, and docs links.

## Outcome

- Replaced divergent root/package prose with a focused repository overview and an
  npm-visible canonical behavioral/API reference. Both state the same runtime floors,
  lifecycle/repair semantics, LWW/document boundary, Web Lock authority, focus/popup
  limits, framework-neutral scope, same-origin trust model, and Safari evidence gap.
- Removed protocol envelopes, message routing, state-operation/sync payloads, and
  storage projection records from the package root. The canonical API table now lists
  every application and testing export, and the documentation gate compares those
  tables to the built `index.d.ts` and `testing.d.ts` export lists.
- Added `pnpm docs:check`. It packs the package, installs the tarball in an isolated npm
  consumer, compiles every marked TypeScript/TSX fence, executes ESM and CJS examples,
  bundles/runs vanilla and direct React browser samples, and rejects unclassified
  executable fences. The passing run verified 7 samples, including 3 browser samples,
  without workspace aliases or a React wrapper.
- The same gate walks tracked project Markdown and rejected broken local destinations;
  the passing run checked 45 Markdown files and 94 relative links. CI's packed-package
  job and the provenance release candidate now run it before accepting artifacts.
- Audited demo and Excalidraw writer paths. The demo's three-tab suite proves one
  editor plus read-only mirrors on Chromium, Firefox, and WebKit (9/9 passed).
  Excalidraw's only scene write is guarded by `editable`; the dashboard always passes
  `false`, and the canvas passes `true` only after `claim('canvas')` returns `claimed`.
- Verification passed: lint, workspace production build (including Excalidraw),
  typecheck, 260 unit/policy tests, the packed package gate at 15,494 gzip bytes, the
  documentation gate, and the 9-test packed demo matrix.
- Expanded `## Files` to include the package root export, changeset, root scripts,
  package scripts, and CI/release workflows. These are required to remove accidental
  internal exports and make the documentation/sample checks release-gating evidence.
