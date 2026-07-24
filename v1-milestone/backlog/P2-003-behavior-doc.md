---
id: P2-003
title: Write docs/BEHAVIOR.md — observed behavior under browser adversity
phase: 2
status: todo
depends_on: [P1-003]
owner: agent
scope: 1 new doc (~120 lines)
---

## Context

The README's Guarantees table states the contract. Adopters evaluating for production ask a sharper question: what actually happens under tab freezing, laptop sleep, incognito, storage pressure? P1-003's edge-case suite provides tested answers; this doc publishes them.

## Task

Create `docs/BEHAVIOR.md` with sections:

- **Tab backgrounding & timer throttling** — what Chrome/Firefox/Safari do to timers, how localStorage-based heartbeats compensate, what P1-003 verified.
- **Tab freezing/discard (Chrome memory saver)** — frozen tabs and heartbeats; what peers observe; recovery on unfreeze (wake-up reconciliation).
- **Laptop sleep/wake** — all tabs suspended together; epoch/registry cleanup on wake; manual-test findings from P1-003's checklist.
- **Incognito/private windows** — separate storage partition = separate workspace (by design); Safari private-mode storage quirks if observed.
- **Crash vs graceful close** — leaving via `tab:leave` vs presence timeout vs (post-P1-001) lock release; what each looks like to survivors.
- **Multiple windows vs tabs** — same origin coordinates across windows too; note OS-level window managers as intended usage.

Every claim must be either (a) covered by a test (link the spec), (b) verified manually (say so and on which browser/OS), or (c) cited to browser documentation. No speculation presented as fact.

Link from README ("Guarantees and tradeoffs" section → "observed behavior details: docs/BEHAVIOR.md").

## Acceptance criteria

- [ ] `docs/BEHAVIOR.md` exists; every claim tagged tested/verified/cited.
- [ ] README links to it.
- [ ] No clock-time promises; behavior described in terms of events and configured timeouts.

## Files

`docs/BEHAVIOR.md` (new), `README.md` (one link).

## Outcome

(pending)
