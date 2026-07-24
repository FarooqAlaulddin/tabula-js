---
id: P1-005
title: Inbound message robustness and trust-model review
phase: 1
status: todo
depends_on: [P0-002]
owner: agent
scope: transport-layer validation + unit tests + 1 doc section
---

## Context

The transport layer currently casts inbound BroadcastChannel/localStorage data to internal types without structural validation. The README's security section correctly states same-origin scripts are trusted — but *trusted* must mean "can coordinate," not "can crash every tab with one malformed postMessage." A stray message from another library sharing a channel name, a corrupted localStorage entry, or a buggy old-version tab after a deploy must degrade gracefully.

## Task

- Add a validation boundary at the transport layer: every inbound message is checked for envelope shape (`type` in the known set, `from` string, `ts` number, `id` string) before dispatch; malformed messages are dropped, counted, and logged once in dev — handlers never see them and never throw on shape.
- Same for registry reads: a corrupted/unparseable localStorage entry is treated as absent and cleaned up, not thrown on.
- **Version tolerance**: add a protocol version to the envelope. Unknown-version messages are dropped with a single dev warning (forward-compat for post-1.0 protocol evolution — this must land BEFORE 1.0, it can't be added compatibly later).
- Bound unbounded growth: dedup-id memory and presence maps must have documented caps or pruning (review existing dedup nonce store for unbounded growth across long-lived tabs).
- Fuzz-style unit tests: feed each domain module garbage payloads (wrong types, missing fields, prototype-polluting keys like `__proto__`, oversized strings) — assert no throw, no state corruption.
- Document the trust model in the README security section: Tabula provides coordination, not authorization; validation is for robustness, not security.

## Acceptance criteria

- [ ] Unit tests: ≥1 malformed-payload test per message type family (presence, state, views, leader) — all green, none throwing.
- [ ] `__proto__`/`constructor` state keys demonstrably do not pollute prototypes.
- [ ] Envelope carries a protocol version; unknown versions dropped with dev warning.
- [ ] Dedup store bounded (test proves old entries evicted).
- [ ] README security section updated with the trust model paragraph.

## Files

`packages/tabula/src/tabula.ts` (transport/dispatch), new `packages/tabula/src/__tests__/robustness.test.ts`, `README.md`, `DECISIONS.md` (protocol version note).

## Outcome

(pending)
