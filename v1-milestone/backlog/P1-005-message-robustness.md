---
id: P1-005
title: Add protocol versioning, validation, and deployment compatibility
phase: 1
status: todo
depends_on: [P1-000]
owner: agent
scope: transport envelope + domain validators + compatibility tests
---

## Context

Inbound BroadcastChannel and storage data is currently cast directly to internal
types. A malformed message can reach every domain module, and a new deployment can
silently partition long-lived tabs if versions disagree. Protocol evolution and
validation must land before any public preview.

Implement against `docs/CONTRACT.md` section 8; its envelope, revision window,
validation limits, bounded stores, and incompatibility event are authoritative.

## Task

- Add protocol major 1/revision 1 with revision 0 compatibility to every message.
- Validate the envelope and each domain payload before dispatch. Reject unknown types,
  invalid ids/timestamps/targets, dangerous keys, excessive nesting, and documented
  oversize payloads without throwing from the message event.
- Emit/log the CONTRACT-selected single observable incompatibility signal for an
  unsupported version, including the user recovery action; deduplicate the signal.
- Keep validation for robustness, not authorization. Same-origin scripts remain trusted.
- Bound deduplication, warning counters, presence discoveries, request-correlation
  records, and any other protocol bookkeeping.
- Add fuzz/property-style tests covering presence, state, views, leader, sync,
  prototype-polluting keys, duplicate ids, wrong targets, and unsupported versions.

## Acceptance criteria

- [ ] No domain handler receives an unvalidated envelope or payload.
- [ ] Unknown compatible fields are handled according to CONTRACT; unsupported versions surface exactly one observable signal per peer/version episode.
- [ ] `__proto__`, `prototype`, and `constructor` cannot pollute objects or become unsafe state keys.
- [ ] All protocol bookkeeping is bounded and eviction is tested.
- [ ] The revision-0 compatible fixture passes; an incompatible major/range degrades exactly as documented.
- [ ] Unit, fuzz, typecheck, and existing browser tests pass.

## Files

Core transport/domain code, protocol/robustness tests, `docs/CONTRACT.md`,
`DECISIONS.md`, and trust-model documentation.

## Outcome

(pending)
