# Tabula — Design Decisions

## What it is
A coordination layer that makes a web app coherent across multiple browser tabs.
One sentence: "Tabula lets you build web apps that treat multiple tabs as one surface."

## Mental model
Every app has a workspace. Tabs are windows into that workspace.
The workspace has two things: shared state and views.
A **view** is a named region of the app that one tab holds at a time (e.g. `writer`, `preview`, `settings`).

## Package structure
- `tabula` — core, zero dependencies, ~6kb gzipped target
- `tabula-react` — TabulaProvider, 5 hooks, depends on core
- `tabula/testing` — test utilities: `createMockWorkspace()`, `createTestCluster()`

## Architecture — 4 layers (bottom up)

### Layer 1 — Transport
- BroadcastChannel for all real-time messages (channel name: `tabula:{namespace}`)
- localStorage for view registry (keys: `tabula:{namespace}:view:{viewName}`)
- `storage` event listener as secondary channel for view registry changes
- No localStorage fallback for BroadcastChannel — throw clear error if unavailable
- All messages share this envelope:
  `{ type, from, to?, payload, id, ts }`
- `to` field present = directed message, only that tab processes it
- Tab ID generated via `crypto.randomUUID()` — throw if unavailable

### Layer 2 — Domain modules (share transport, have directed dependencies)

**Dependency graph:** Presence → Leader → State, Presence → Views

#### Presence
- Heartbeat every 1500ms (configurable)
- Tab map: tabId → TabMeta
- **Visibility-aware pruning:**
  - Visible tabs: prune after `timeout` ms (default 5000)
  - Hidden tabs: prune after `timeout * 4` ms (default 20000) to account for browser timer throttling
- On startup: broadcast tab:announce, others respond immediately
- Graceful close: broadcast tab:leave in beforeunload/pagehide
- **Wake-up reconciliation:** on `visibilitychange` → visible, re-broadcast tab:announce and re-validate local state

#### Leader
- Built on presence, not transport directly
- Leader = tab with smallest **locally-observed first-seen timestamp** (not self-reported joinedAt)
- Each tab records when it first observed every other tab via tab:announce
- Tiebreak: lexicographic tabId
- No election algorithm — falls out of presence for free
- Recalculates on every presence change
- Prefer visible tabs: hidden tabs are deprioritized for leadership (only become leader if no visible tabs exist)

#### State
- Flat key-value store, lives in memory only
- Each entry: `{ value, ts, tabId, version }`
- Conflict: last-write-wins by ts, tiebreak by tabId lexicographic
- **State sync:** new tab broadcasts `state:sync-request` to ALL tabs. Each tab responds with its state. Requester merges by highest `ts` per key. This prevents stale-leader serving stale state.
- Sync request has a **5-second timeout**. If no response arrives, tab starts with empty state and logs a warning.
- No persistence — developer handles that in their own state.on() callbacks
- **Typed state:** `createWorkspace<StateShape>()` flows types through all state methods

#### Views (formerly "Contexts")
- Two sources of truth: localStorage (durable) + in-memory map (fast)
- `storage` event listened to as secondary sync for view registry changes
- Startup sequence:
  1. Read localStorage view entries
  2. Filter stale entries by session epoch
  3. Wait one heartbeat cycle to confirm tabs are alive
  4. Dead view entries get cleaned up → view:vacant
- Claiming: check localStorage first, broadcast view:claim, wait one heartbeat, re-read localStorage to confirm. Deterministic tiebreaker (lowest tabId wins) on conflict.
- Releasing: delete localStorage, broadcast, emit view:vacant
- Ungraceful close: presence timeout triggers view cleanup
- **Wake-up reconciliation:** on `visibilitychange` → visible, re-read localStorage view registry, compare against local beliefs, yield if view was reassigned

### Layer 3 — Coordinator
- Only thing the public API talks to
- Owns startup and shutdown sequences
- Translates internal events → public API events
- Startup order:
  1. Generate/restore tab ID from sessionStorage (via `crypto.randomUUID()`)
  2. Check/write session epoch to sessionStorage
  3. Open BroadcastChannel + attach `storage` event listener
  4. Read + filter localStorage view registry
  5. Broadcast tab:announce
  6. Wait up to 100ms OR until responses received from all tabs listed in localStorage view registry (whichever comes first)
  7. Broadcast state:sync-request to all tabs, merge responses (5s timeout)
  8. Validate view registry against known live tabs
  9. Claim declared view if app.claim() was called
  10. Emit 'ready'
- Queues all public API calls made before 'ready', flushes after
- **Startup timeout warning:** if ready hasn't fired after 10s, log a diagnostic warning

### Layer 4 — Public API
Thin wrapper over Coordinator.
Includes `app.destroy()` for full teardown (close BroadcastChannel, clear intervals, remove listeners, broadcast tab:leave, clean up localStorage entries).

## Tab Identity
- Tab ID: generated once via `crypto.randomUUID()`, stored in sessionStorage (survives refresh, not duplication)
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
```

### State (fully typed)
```ts
app.state.set('theme', 'dark')          // value must match MyState['theme']
app.state.get('theme')                   // returns 'light' | 'dark'
app.state.on('theme', (value) => {})     // value is 'light' | 'dark'
app.state.on('*', (key, value) => {})    // wildcard
app.state.delete('theme')
```

### Views (formerly Contexts)
```ts
// Open a view in a new tab (returns view handle)
const handle = await app.open('writer', {
  url: '/write',
  syncKeys: ['draft', 'currentUser']    // state keys copied to new tab
})
// handle has: .on(), .release(), .focus()

// Declare this tab's view (called inside the opened tab)
app.claim('writer')

// Query
app.views.get('writer')    // TabMeta | null
app.views.list()           // Record<string, TabMeta>
app.views.has('writer')    // boolean

// Events
app.on('view:claimed', ({ name, tab }) => {})
app.on('view:vacant', ({ name }) => {})
app.on('view:conflict', ({ name, existing, incoming }) => {})

// Focus existing view tab
app.focus('writer')
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
  // runs when this tab becomes leader
  return function cleanup() {
    // runs when this tab loses leadership
  }
})

app.isLeader()   // boolean
app.on('leader:change', ({ tab, isMe }) => {})
```

### Lifecycle
```ts
app.destroy()    // full teardown — close channel, clear intervals, broadcast leave, clean localStorage
```

### General events
```ts
app.on(event, callback)   // returns unsubscribe fn
app.off(event, callback)
```

## View handle (returned by app.open())
```ts
handle.on('vacant', () => {})
handle.on('conflict', ({ existing, incoming }) => {})
handle.release()
handle.focus()
```

## Error philosophy
- Hard errors (throw on init): BroadcastChannel unavailable, crypto.randomUUID unavailable, no namespace, double claim() call
- Soft errors (emitted as events): view:conflict, app.open() timeout (promise rejects), state sync timeout (starts with empty state + warning)
- Silent recovery (internal): stale registry, dead tab views, dedup, out-of-order messages, wake-up reconciliation
- **Error message format:** what happened + why it matters + what to do
- **Startup timeout:** warning after 10s if ready hasn't fired

## Message deduplication
- Set-based (O(1) lookup), not array-based
- Sliding window of last 500 message IDs, evicted by count
- BroadcastChannel does not deliver duplicates natively; dedup guards against future storage event integration and edge cases

## tabula-react
- React Context based (not module singleton)
- TabulaProvider calls app.start() internally, suspends until ready
- Exports: TabulaProvider, useSharedState, useLeader, useTabPresence, **useTabView** (renamed from useTabContext to avoid React collision)
- Re-exports nothing from core
- Multiple workspaces supported via nested providers
- Testing: pass mock workspace to TabulaProvider

## tabula/testing
- `createMockWorkspace<S>()` — returns a workspace that implements the full API with no BroadcastChannel dependency. Works in Node.js.
- `createTestCluster<S>(namespace)` — creates an in-memory channel shared between multiple mock workspaces. Enables multi-tab testing:
  ```ts
  const cluster = createTestCluster<MyState>('test')
  const tabA = cluster.createTab()
  const tabB = cluster.createTab()
  tabA.state.set('theme', 'dark')
  // tabB.state.get('theme') === 'dark'
  ```

## Security considerations
- Tabula trusts all scripts on the same origin. XSS on any page compromises all tabs in the workspace.
- Shared state should be treated as untrusted UI hints. Security-critical decisions must be validated server-side.
- Never store auth tokens, API keys, or raw PII in shared state. BroadcastChannel messages are plaintext and accessible to any same-origin script.
- Leader identity is based on locally-observed timestamps (not self-reported), making leader spoofing harder but not impossible for same-origin attackers.
- Any same-origin script can passively observe all Tabula traffic.
- TabMeta does NOT include URLs by default — only tab ID, first-seen timestamp, visibility, and view name. URL is opt-in via metadata.

## Explicit non-goals (never implement)
- No RPC
- No cross-origin
- No state persistence
- No scoped/namespaced state
- No conflict resolution strategies beyond last-write-wins
- No cross-device sync
- No BroadcastChannel polyfill/fallback
- No UI components
- No URL/routing opinions
