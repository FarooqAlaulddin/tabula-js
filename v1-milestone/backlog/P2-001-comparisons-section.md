---
id: P2-001
title: Add honest comparisons section to README
phase: 2
status: todo
depends_on: [P0-002, P1-001]
owner: agent
scope: 1 README section (~60 lines)
---

## Context

The #1 objection to any new coordination library is "why not just use X?". An honest comparisons section pre-empts it and fits the README's owned-tradeoffs voice. The content already exists in design-review notes; this task distills it.

## Task

Add a `## Alternatives` (or `## Compared to…`) section after "Guarantees and tradeoffs" covering, with genuine concessions:

- **Raw BroadcastChannel** — right choice for one simple message type; Tabula adds presence/leadership/views when coordination grows past transport.
- **`broadcast-channel` (npm)** — battle-tested, has leader election, has fallbacks for older browsers (concede this); no presence model, no typed state, no views.
- **Web Locks API** — after P1-001, note Tabula builds on it; alone it gives exclusion without leader identity, events, or presence.
- **SharedWorker** — genuinely shared execution context (concede); but no per-tab model, painful debugging, no Safari service-worker interplay, and doesn't solve views/presence.
- **State-library plugins (redux-state-sync, Zustand middleware, TanStack Query broadcast)** — right choice if the only need is store sync inside that framework; framework-bound, no leadership/views.
- **A server (WebSocket fan-out)** — required anyway for cross-device; Tabula is same-device coordination that removes redundant connections rather than replacing the server.

Format: one short table + a paragraph per row, max ~60 lines total. Every row must name a case where the alternative is the better pick — no strawmen.

## Acceptance criteria

- [ ] Section present, ≤ ~60 lines, each alternative includes a concession.
- [ ] No factual overclaims (verify `broadcast-channel` features against its README before characterizing it).
- [ ] Every alternative's row/paragraph contains an explicit "use X instead when …" sentence (mechanical check for the no-strawmen rule).

## Files

`README.md`.

## Outcome

(pending)
