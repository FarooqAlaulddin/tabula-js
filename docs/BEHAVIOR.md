# Browser behavior and support

This document translates the normative [1.0 behavioral contract](./CONTRACT.md) into
operational guidance. It describes the current implementation and separates automated
evidence from checks that still require a real browser or machine lifecycle.

## Evidence labels

- **Automated:** enforced by the linked unit or Playwright browser test.
- **Manual pending:** a release check is defined, but no dated passing result exists yet.
- **Standard:** behavior controlled by the linked browser standard rather than Tabula.

A manual-pending item is not release evidence. Playwright WebKit on Linux is WebKit
coverage only; it is never described here as Safari on macOS proof.

## Runtime admission and tested engines

Tabula admits a page by capabilities, not by user-agent string.

| Requirement | Behavior | Evidence |
|-------------|----------|----------|
| Top-level secure context | Creation fails synchronously before resources attach when the context is insecure or embedded. Iframes are unsupported. | **Automated:** [lifecycle unit tests](../packages/tabula/src/__tests__/lifecycle.test.ts); **Standard:** [Secure Contexts](https://w3c.github.io/webappsec-secure-contexts/) |
| Web Locks | `navigator.locks` supplies held-lock authority for leadership and named views. | **Automated:** [capability browser tests](../e2e/tests/capability.spec.ts), [leader tests](../e2e/tests/leader.spec.ts), [view tests](../e2e/tests/views.spec.ts); **Standard:** [Web Locks](https://www.w3.org/TR/web-locks/) |
| BroadcastChannel | Same-origin protocol messages require `BroadcastChannel`. | **Automated:** [capability browser tests](../e2e/tests/capability.spec.ts), [channel unit tests](../packages/tabula/src/__tests__/channel.test.ts); **Standard:** [HTML BroadcastChannel](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts) |
| Random identifiers | `crypto.randomUUID()` supplies document, operation, intent, and claim identifiers. | **Automated:** [lifecycle and identity tests](../packages/tabula/src/__tests__/lifecycle.test.ts); **Standard:** [Web Cryptography Level 2](https://w3c.github.io/webcrypto/#Crypto-method-randomUUID) |
| Structured cloning | `structuredClone()` validates and isolates supported state values before they are committed. | **Automated:** [lifecycle capability tests](../packages/tabula/src/__tests__/lifecycle.test.ts), [state value tests](../packages/tabula/src/__tests__/state.test.ts); **Standard:** [HTML structured clone](https://html.spec.whatwg.org/multipage/structured-data.html#structured-cloning) |
| Browser storage | Read/write/remove probes for both `localStorage` and `sessionStorage` must succeed at creation. | **Automated:** [lifecycle storage tests](../packages/tabula/src/__tests__/lifecycle.test.ts); **Standard:** [HTML Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html) |
| Coordination scope | Participants must use the same origin and workspace namespace on one browser/device. | **Automated:** [workspace isolation tests](../packages/tabula/src/__tests__/coordinator.test.ts); **Standard:** BroadcastChannel and Web Locks are origin-scoped in the standards linked above. |

The final expanded matrix was run on 2026-08-14 with retries disabled.

| Playwright project | Tested engine | Result | Interpretation |
|--------------------|---------------|--------|----------------|
| Chromium | Chrome for Testing 145.0.7632.6, build 1208 | 56/56 | Portable suite plus Chromium-only lifecycle controls |
| Firefox | Firefox 146.0.1, build 1509 | 53/53 | Portable suite |
| WebKit | Playwright WebKit 26.0, build 2248 | 53/53 | Portable suite; not Safari proof |
| Safari on macOS | Pending | [Manual checklist](./SAFARI-CHECKLIST.md) | Required before the 1.0 release candidate |

**Automated:** the complete 162-test matrix passed three consecutive times; see the
[adversarial task evidence](../v1-milestone/backlog/P1-003-edge-case-e2e.md). These
versions are evidence floors, not claims that older versions fail.

## Scheduling, presence, and time

**Automated:** presence is an eventual liveness estimate. A tab announces itself on
the configured heartbeat interval. A peer without a storage lease is suspected after
the configured timeout; a peer with a lease is retained until three times that timeout.
All bounds also include runnable scheduling delay, so they are not wall-clock deadlines.
See [presence unit tests](../packages/tabula/src/__tests__/presence.test.ts) and
[browser presence tests](../e2e/tests/presence.spec.ts).

**Automated:** a synthetic bfcache suspension lasting beyond the presence timeout can
temporarily remove a peer. On resume, membership and queued state converge without a
new tab identity. See [portable adversity tests](../e2e/tests/adversarial.spec.ts).

**Automated:** Chromium CDP freeze controls show that a frozen follower resumes without
identity churn, and that frozen leader and view lock holders are not replaced while
their Web Locks remain held. See [Chromium lifecycle tests](../e2e/tests/chromium-lifecycle.spec.ts).

**Manual pending:** real browser memory discard, operating-system sleep/wake, low-power
mode, multi-monitor focus, and recovery after a wall-clock change remain checks in the
[adversity checklist](./ADVERSARIAL-CHECKLIST.md) and
[Safari checklist](./SAFARI-CHECKLIST.md). Tabula promises eventual repair when the
browser runs the page again, not progress while JavaScript is suspended.

**Automated:** state operation clocks remain monotonic when `Date.now()` moves backward
and advance from accepted remote clocks. See [state unit tests](../packages/tabula/src/__tests__/state.test.ts).

## Close, crash, refresh, bfcache, and restart

**Automated:** `destroy()` and non-persisted `pagehide` perform terminal cleanup.
Abrupt page or worker termination releases browser-held authority, after which a live
peer eventually becomes leader and a view eventually becomes vacant and reclaimable.
See [lifecycle unit tests](../packages/tabula/src/__tests__/lifecycle.test.ts),
[leader browser tests](../e2e/tests/leader.spec.ts), and
[portable adversity tests](../e2e/tests/adversarial.spec.ts).

**Automated:** refresh preserves the tab identity but creates a new document instance.
A refreshed view owner must reacquire the view with a newer fenced claim; stale handles
cannot control it. See [lifecycle browser tests](../e2e/tests/lifecycle.spec.ts) and
[view browser tests](../e2e/tests/views.spec.ts).

**Automated:** a persisted `pagehide`/`pageshow` cycle is modeled as non-terminal
`bfcache-suspended` state. The same identity resumes, queued mutations flush in order,
and retained authority is checked before callbacks resume. The portable test dispatches
page-transition events; actual browser bfcache eligibility remains browser policy. See
[lifecycle browser tests](../e2e/tests/lifecycle.spec.ts).

**Manual pending:** force-quit and full browser restart are covered by the
[adversity checklist](./ADVERSARIAL-CHECKLIST.md). Tabula state is memory-only and it
does not promise state, ownership continuity, or cleanup callbacks after process death.

## Storage and privacy modes

**Automated:** blocked baseline storage produces one synchronous `CapabilityError`
before transport, lifecycle listeners, or lock requests attach. Loss during initialization
enters a terminal failed state, and a quota-blocked view claim leaves no partial local
claim. Corrupt discovery projections are quarantined; corrupt authority generation
records are not reset. See [lifecycle storage tests](../packages/tabula/src/__tests__/lifecycle.test.ts),
[registry tests](../packages/tabula/src/__tests__/registry.test.ts), and
[authority storage tests](../packages/tabula/src/__tests__/leader.test.ts).

**Manual pending:** private browsing, browser-specific storage partitioning, user-disabled
storage, and real post-readiness access/quota failures during state, claim, and open
operations vary by browser/profile and must pass the
[adversity checklist](./ADVERSARIAL-CHECKLIST.md) plus the dedicated
[Safari checklist](./SAFARI-CHECKLIST.md). A context that cannot pass Tabula's probes
cannot join; Tabula does not silently downgrade its feature set.

## Tabs, windows, popups, and focus

**Automated:** same-origin tabs participate in the same workspace when they use the
same namespace. A child receives a distinct tab identity even if the browser copies
opener session storage. See [lifecycle browser tests](../e2e/tests/lifecycle.spec.ts).

**Manual pending:** separate browser windows are expected to participate when the
browser places them in the same storage partition, but normal/private-window and
multi-window combinations remain checks in the
[adversity checklist](./ADVERSARIAL-CHECKLIST.md).

**Standard:** `window.open()` may return `null` when the browser blocks a popup, and
transient user activation is consumed according to browser policy. Call `open()` from
a direct user gesture. See the [HTML window open steps](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-open-dev).

**Automated:** when a popup is blocked, Tabula rejects `open()` and removes the pending
handoff intent. A successful handoff transfers only selected validated state operations;
intent metadata expires after `openTimeout`, 10 seconds by default. See
[lifecycle unit tests](../packages/tabula/src/__tests__/lifecycle.test.ts) and
[view browser tests](../e2e/tests/views.spec.ts).

**Automated + Standard:** `focus()` sends a fenced request only to the current view
owner and invokes `window.focus()` there. Whether the browser foregrounds that tab is
not guaranteed. See [view tests](../e2e/tests/views.spec.ts) and the
[HTML focus method](https://html.spec.whatwg.org/multipage/interaction.html#dom-window-focus).
Real cross-window/desktop behavior remains **manual pending** in the
[adversity checklist](./ADVERSARIAL-CHECKLIST.md).

## Mixed deployments and recovery

**Automated:** the current protocol emits major 1 revision 1 and accepts compatible
revisions 0 through 1. Additive unknown fields and message types are ignored after
validation; malformed or non-overlapping traffic cannot reach domain state. See
[protocol unit tests](../packages/tabula/src/__tests__/protocol.test.ts).

**Automated:** an incompatible peer episode emits one `protocol:incompatible` event
with the recovery instruction `Save work and reload all application tabs.` Repeated
messages from that episode do not repeatedly notify or mutate state. See
[portable adversity tests](../e2e/tests/adversarial.spec.ts) and
[protocol unit tests](../packages/tabula/src/__tests__/protocol.test.ts).

The automated recovery instruction is to reload every application tab together after
a mixed-version warning; it does not promise that independently deployed protocol
majors can interoperate.

## Shared-state boundary

**Automated:** state uses a deterministic hybrid-logical-clock order with actor and
operation tie-breakers. Peers that receive the same validated operation set converge
regardless of delivery order. Deletes create tombstones that prevent delayed sets or
snapshots from resurrecting a key for the workspace cohort's lifetime. See
[state unit tests](../packages/tabula/src/__tests__/state.test.ts) and
[state browser tests](../e2e/tests/state.spec.ts).

**Automated:** startup has a bounded usable-readiness budget, not a bounded completeness
promise. Missing peers produce observable `repairing` status; retained late responses
continue merging until the current live peer set is complete. See
[state browser tests](../e2e/tests/state.spec.ts) and
[synchronization unit tests](../packages/tabula/src/__tests__/coordinator.test.ts).

**Automated scope:** deterministic last-write-wins ordering does not merge concurrent
intent. Document bodies, rich text, and scenes such as Excalidraw are unsafe with
multiple Tabula writers. Use one atomically claimed editor with read-only mirrors, or
use a CRDT/operational-transform/server-authoritative data engine. The exclusive-writer
pattern is exercised by [view contention tests](../e2e/tests/views.spec.ts); concurrent
document collaboration is intentionally outside Tabula's test and product scope.
