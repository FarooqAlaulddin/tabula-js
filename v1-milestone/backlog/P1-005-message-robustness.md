---
id: P1-005
title: Add protocol versioning, validation, and deployment compatibility
phase: 1
status: done
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

- [x] No domain handler receives an unvalidated envelope or payload.
- [x] Unknown compatible fields are handled according to CONTRACT; unsupported versions surface exactly one observable signal per peer/version episode.
- [x] `__proto__`, `prototype`, and `constructor` cannot pollute objects or become unsafe state keys.
- [x] All protocol bookkeeping is bounded and eviction is tested.
- [x] The revision-0 compatible fixture passes; an incompatible major/range degrades exactly as documented.
- [x] Unit, fuzz, typecheck, and existing browser tests pass.

## Files

Core transport/domain code, protocol/robustness tests, `docs/CONTRACT.md`,
`DECISIONS.md`, and trust-model documentation.

## Outcome

- Added a zero-dependency protocol boundary that emits major 1/revision 1 envelopes,
  accepts the documented revision-0 fixture, validates exact tab/instance targets,
  and ignores unknown compatible fields and message types.
- Added structural validation for every current presence, state, sync, view, leader,
  and protocol-control payload before domain dispatch. The boundary rejects malformed
  identities, timestamps, targets, unsafe keys, clone-hostile values, excessive depth
  or node counts, and envelopes over 1 MiB without throwing from the event handler.
- Added per-load instance identities and instance-scoped message ids. Directed sync
  responses now target the requesting instance rather than every load sharing a tab id.
- Added the public, typed `protocol:incompatible` event and one directed reject per
  peer/version episode with the contracted reload guidance. Episode tracking is capped
  at 128 and emits one capacity warning.
- Expanded deduplication to the contractual 2,048 ids with five-minute expiry and
  tested FIFO eviction. Presence projection is capped at 256 peers with one warning.
- Validated view-registry and presence JSON before use, regenerated malformed stored
  identity values, used prototype-safe registry result records, and rejected dangerous
  local state keys before send or mutation.
- Expanded task scope to root/package protocol documentation, public type exports,
  existing transport/domain fixtures, storage tests, and coordinator event tests because
  the protocol envelope is an observable package contract across those boundaries.
- Added revision, compatibility, family-validator, malformed storage, targeting,
  duplicate, capacity, prototype-pollution, and deterministic fuzz/property-style tests.
  The suite now has 213 passing unit tests.
- Verified repository lint, workspace typecheck, production/declaration builds,
  milestone validation, diff whitespace, and all 26 Chromium end-to-end tests.
