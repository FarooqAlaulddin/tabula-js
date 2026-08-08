---
id: P2-004
title: Align npm package documentation and executable examples
phase: 2
status: todo
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

- [ ] npm-visible READMEs state the same support and behavioral contract as root docs.
- [ ] Every public symbol has one canonical documented reference; nothing internal is advertised.
- [ ] All executable code blocks compile against packed tarballs and browser examples run.
- [ ] Excalidraw/demo behavior does not contradict the LWW/document non-goal.
- [ ] Broken relative links are detected in CI or by a documented link check.

## Files

Root/package READMEs, examples, sample extraction/test harness, and docs links.

## Outcome

(pending)
