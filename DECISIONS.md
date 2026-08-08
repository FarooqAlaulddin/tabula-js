# Tabula — Design Decisions

> **Status note (2026-08-08):** Sections written before the dated v1 decisions are
> preserved as the `0.1.0` design history. [The 1.0 behavioral contract](./docs/CONTRACT.md)
> is normative where it supersedes oldest-tab leadership, timestamp-only state order,
> unconditional deletes, session epochs, or localStorage view claims.

## What it is
A coordination layer that makes a web app coherent across multiple browser tabs.
One sentence: "Tabula lets you build web apps that treat multiple tabs as one surface."

## Mental model
Every app has a workspace. Tabs are windows into that workspace.
The workspace has two things: shared state and views.
A **view** is a named region of the app that one tab holds at a time (e.g. `writer`, `preview`, `settings`).

## Package structure
- `tabula` — core, zero dependencies, ~7kb gzipped
- `tabula-react` — TabulaProvider, 5 hooks, depends on core
- `tabula/testing` — test utilities: `createMockWorkspace()`, `createTestCluster()`

## Architecture — 4 layers (bottom up)

### Layer 1 — Transport
- BroadcastChannel for all real-time messages (channel name: `tabula:{namespace}`)
- localStorage for view registry (keys: `tabula:{namespace}:view:{viewName}`)
- localStorage for presence registry (keys: `tabula:{namespace}:tab:{tabId}`)
- `storage` event listener as secondary channel for view registry changes
- No localStorage fallback for BroadcastChannel — throw clear error if unavailable
- All messages share this envelope:
  `{ type, from, to?, payload, id, ts }`
- `to` field present = directed message, only that tab processes it
- Tab ID generated via `crypto.randomUUID()` — throw if unavailable
- Message IDs include a per-load nonce to prevent dedup collision across refreshes
- Iframes are not supported (runtime check throws)

### Layer 2 — Domain modules (share transport, have directed dependencies)

**Dependency graph:** Presence → Leader → State, Presence → Views

#### Presence
- Single timer (heartbeat + prune) every `heartbeatMs` (default 1500ms)
- Tab map: tabId → TabMeta
- **localStorage-based presence:** each tab writes its `lastSeen` timestamp to localStorage on every heartbeat and visibility change. Prune checks localStorage timestamps, not BroadcastChannel message timing. This eliminates false pruning from Chrome's timer throttling.
- Pruning: tabs with no localStorage entry pruned after `timeout`. Tabs with stale localStorage pruned after `timeout * 3`.
- On startup: broadcast tab:announce with `createdAt` timestamp, others respond immediately
- Graceful close: broadcast tab:leave + remove localStorage presence entry
- **Wake-up reconciliation:** on `visibilitychange` → visible, re-broadcast tab:announce and re-validate local state

#### Leader
- Built on presence, not transport directly
- Leader = tab with smallest `createdAt` timestamp (self-reported in announce payload, globally comparable)
- Tiebreak: lexicographic tabId
- No visibility preference — oldest tab is always leader regardless of focus state
- No election algorithm — falls out of presence for free
- Recalculates on every presence change (join/leave)

#### State
- Flat key-value store, lives in memory only
- Each entry: `{ value, ts, tabId, version }`
- Conflict resolution: last-write-wins by `ts`, then `tabId`, then `version` (handles rapid same-tab writes within the same millisecond)
- **State sync:** new tab broadcasts `state:sync-request` to ALL tabs. Listens for first `state:sync` response or 150ms timeout.
- **No persistence** — developer handles that in their own `state.on()` callbacks (see demo for pattern)
- **Typed state:** `createWorkspace<StateShape>()` flows types through all state methods

#### Views (formerly "Contexts")
- Two sources of truth: localStorage (durable) + in-memory map (fast, cached)
- `storage` event listened to as secondary sync for view registry changes
- Claiming: check localStorage first, write claim. Per-view pending-open keys prevent race conditions.
- Releasing: delete localStorage, broadcast, emit view:vacant
- Ungraceful close: presence timeout triggers view cleanup
- **Wake-up reconciliation:** on `visibilitychange` → visible, re-read localStorage view registry, yield if view was reassigned
- `app.open()` writes sync data to localStorage (not URL params) — keeps URLs clean

### Layer 3 — Coordinator
- Only thing the public API talks to
- Owns startup and shutdown sequences, double-destroy guard
- Translates internal events → public API events
- Startup order:
  1. Generate/restore tab ID from sessionStorage (via `crypto.randomUUID()`)
  2. Check/write session epoch to sessionStorage
  3. Open BroadcastChannel + attach `storage` event listener
  4. Read + filter localStorage view registry
  5. Broadcast tab:announce
  6. Wait for tab:join events or timeout (100-150ms)
  7. Send state:sync-request, listen for response (150ms timeout)
  8. Validate view registry against known live tabs
  9. Claim declared view if app.claim() was called
  10. Set ready=true, flush queue, resolve `app.ready` promise
- Queues all `state.set()`, `state.delete()`, `claim()` calls made before 'ready', flushes after

### Layer 4 — Public API
Thin wrapper over Coordinator.
- `app.ready` — Promise that resolves when init is complete (state synced, leader elected)
- `app.destroy()` — full teardown with double-destroy guard
- All mutating calls go through `enqueue()` for pre-ready safety

## Tab Identity
- Tab ID: generated once via `crypto.randomUUID()`, stored in sessionStorage (survives refresh)
- `window.opener` detection: clears inherited sessionStorage tab ID for tabs opened via `window.open()` (prevents parent/child sharing the same ID)
- Session epoch: timestamp in sessionStorage (cleared on new session)
- Stale = view registry entry whose epoch doesn't match current epoch

## Complete message protocol (13 types)
```
tab:announce, tab:heartbeat, tab:leave
state:sync-request, state:sync, state:set, state:delete
view:claim, view:claimed, view:release, view:conflict, view:focus
leader:change
```

## Public API shape

### Init
```ts
interface MyState {
  theme: 'light' | 'dark'
  currentUser: User | null
  draft: string
}

const app = createWorkspace<MyState>('my-cms', {
  heartbeat: 1500,
  timeout: 5000,
  session: true
})

// Wait for init before setting defaults
await app.ready
```

### State (fully typed)
```ts
app.state.set('theme', 'dark')          // value must match MyState['theme']
app.state.get('theme')                   // returns 'light' | 'dark'
app.state.on('theme', (value) => {})     // value is 'light' | 'dark'
app.state.on('*', (key, value) => {})    // wildcard
app.state.delete('theme')
app.state.keys()                         // returns array of set keys
app.state.entries()                      // returns [key, value] pairs
app.state.setAll({ theme: 'dark', draft: '' })  // batch set
```

### Views
```ts
const handle = await app.open('writer', {
  url: '/write',
  syncKeys: ['draft', 'currentUser']
})

app.claim('writer')
app.views.get('writer')    // TabMeta | null
app.views.list()           // Record<string, TabMeta>
app.views.has('writer')    // boolean
app.focus('writer')

app.on('view:claimed', ({ name, tab }) => {})
app.on('view:vacant', ({ name }) => {})
app.on('view:conflict', ({ name, existing, incoming }) => {})
```

### Tabs / Presence
```ts
app.tabs.list()      // TabMeta[]
app.tabs.current()   // TabMeta
app.tabs.leader()    // TabMeta | null

app.on('tab:join', (tab) => {})
app.on('tab:leave', (tab) => {})
```

### Leader
```ts
app.onLeader(function setup() {
  return function cleanup() {}
})

app.isLeader()   // boolean
app.on('leader:change', ({ tab, isMe }) => {})
```

### Lifecycle
```ts
await app.ready  // wait for init
app.destroy()    // full teardown
```

## Error philosophy
- Hard errors (throw on init): BroadcastChannel unavailable, crypto.randomUUID unavailable, no namespace, double claim() call, iframe detected
- Soft errors (emitted as events): view:conflict, app.open() timeout (promise rejects), state sync timeout (starts with empty state)
- Silent recovery (internal): stale registry, dead tab views, dedup, out-of-order messages, wake-up reconciliation
- **Error message format:** what happened + why it matters + what to do

## Message deduplication
- Set-based (O(1) lookup)
- Sliding window of last 500 message IDs, evicted by count
- Message IDs include per-load nonce (`tabId:nonce:counter`) to prevent collision across page refreshes

## State persistence
State lives in memory only. Persistence is the **app's responsibility**, not the library's. Pattern:
```ts
app.state.on('*', () => {
  localStorage.setItem('my-state', JSON.stringify(snapshot))
})
```

## tabula-react
- React Context based (not module singleton)
- TabulaProvider wraps children with context, renders via createElement
- Exports: TabulaProvider, useSharedState, useLeader, useTabPresence, useTabView
- Re-exports nothing from core
- Multiple workspaces supported via nested providers

## tabula/testing
- `createMockWorkspace<S>()` — full Workspace interface, no browser APIs, works in Node.js
- `createTestCluster<S>(namespace)` — in-memory BroadcastChannel simulation for multi-tab testing

## Security considerations
- Tabula trusts all scripts on the same origin. XSS on any page compromises all tabs in the workspace.
- Shared state should be treated as untrusted UI hints. Security-critical decisions must be validated server-side.
- Never store auth tokens, API keys, or raw PII in shared state.
- Leader identity is based on self-reported timestamps. A same-origin attacker could spoof leadership.
- Any same-origin script can passively observe all Tabula traffic.

## Explicit non-goals (never implement)
- No RPC
- No cross-origin
- No scoped/namespaced state
- No conflict resolution strategies beyond last-write-wins
- No cross-device sync
- No BroadcastChannel polyfill/fallback
- No UI components
- No URL/routing opinions
- No iframe support

## 2026-08-08 — v1 package boundary

- The sole v1 npm package is `@farooqalaulddin/tabula-js`; its testing utilities
  remain the `@farooqalaulddin/tabula-js/testing` subpath.
- The earlier `tabula` and `tabula-react` package notes above are historical. Neither
  name was published by this project, and both workspace package identities are
  removed from the v1 implementation.
- A React wrapper is deferred until after v1. Framework applications consume the
  core workspace directly and own their framework-specific subscription boundary.
- The React-based Excalidraw example remains as proof of direct core integration,
  not as a wrapper-package contract.

## 2026-08-08 — v1 coordination authority and convergence

- `docs/CONTRACT.md` freezes I1-I10 before implementation changes. Phase 1 tasks must
  update that contract explicitly if implementation evidence forces a design change.
- Leadership and named-view ownership use held Web Locks as their only exclusion
  authority. Presence and localStorage remain eventual projections, never authority.
- Leader and view projections carry persistent monotonic generations created while
  the corresponding lock is held. Stale messages and handles cannot mutate a newer term.
- Shared state uses totally ordered hybrid-logical-clock operations. Delete is a
  retained tombstone, and `setAll` is an atomic batch with post-commit notifications.
- Startup merges correlated responses from all known peers and exposes incomplete
  sync while bounded repair continues after readiness.
- Every wire message uses the validated major/revision envelope. Unsupported ranges
  produce one public recovery signal instead of silent partition.
- A session-stored tab id is paired with a per-load instance id and duplicate probing;
  opener presence and storage inheritance are not identity authority.
- The selected and rejected alternatives, rationale, limits, failure semantics, and
  browser-policy boundaries are recorded in the contract rather than duplicated here.

## 2026-08-08 — lifecycle, identity, and storage hardening

- `readyTimeout` is one total runnable-time budget for identity probing, discovery,
  and initial state synchronization. It is not a separate budget for every stage.
- A session-stored tab id is only a candidate. Every document has a separate instance
  id and probes before announcing presence; the later `(startedAt, instanceId)` claim
  repairs to a fresh tab id. Opener state is not used as identity authority.
- Lifecycle is observable through immutable `status()` snapshots and `sync:status`.
  Terminal destroy/failure rejects queued asynchronous work and prevents all later
  public operations except status inspection and repeated destroy.
- Persisted `pagehide` suspends resources without broadcasting departure. Persisted
  `pageshow` revalidates identity and reruns bounded discovery before queued work and
  leader callbacks resume.
- Baseline browser and storage capabilities are probed synchronously before attachment.
  Later storage writes use typed transactional errors; malformed non-authoritative
  projections are quarantined with a bounded diagnostic.
- The old `session` option and startup epoch sweep were removed. A newly loaded tab
  must never delete another live tab's registry projection merely because its document
  session differs.
