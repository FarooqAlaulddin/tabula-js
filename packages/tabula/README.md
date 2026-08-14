# Tabula

**Coordinate browser tabs as views of a single workspace.**

Tabula lets you build web apps that treat multiple tabs as one surface. Shared state, presence tracking, leader election, and named views through modern browser coordination APIs, with zero dependencies.

---

## Why

Every multi-tab web app reinvents the same coordination problems:

- User logs out in one tab — other tabs don't know.
- Two tabs poll the same API independently — wasted resources.
- User opens a settings panel that should only exist once.
- Background work (WebSocket, polling) runs in every tab instead of one.

Tabula solves all of these with a single primitive: the **workspace**.

## Install

```bash
npm install @farooqalaulddin/tabula-js
```

## Quick start

```ts
import { createWorkspace } from '@farooqalaulddin/tabula-js'

interface AppState {
  theme: 'light' | 'dark'
  filter: 'all' | 'open'
}

const app = createWorkspace<AppState>('my-app')

await app.ready

// Shared UI state — converges across live tabs
app.state.set('theme', 'dark')
app.state.on('theme', (value) => {
  document.body.dataset.theme = value
})

// Leader election — only one tab runs background work
app.onLeader(() => {
  const ws = new WebSocket('/events')
  return () => ws.close() // cleanup when leadership changes
})

// Presence — know which tabs are connected
app.on('tab:join', (tab) => console.log(`${tab.id} joined`))
app.on('tab:leave', (tab) => console.log(`${tab.id} left`))
```

## Core concepts

### Workspace

A workspace is a coordination scope. All tabs that create a workspace with the same namespace share state, presence, and views.

```ts
const app = createWorkspace<MyState>('my-app', {
  heartbeat: 1500,  // presence heartbeat interval (ms)
  timeout: 5000,    // time before a silent tab is considered dead
})

await app.ready // resolves when init is complete
```

### Shared state

A typed key-value store that syncs across tabs in real time. Set and delete operations
use a hybrid logical clock plus actor and operation-id tie breakers, so delivery order
does not change the winner. Deletes retain in-memory tombstones to prevent stale
traffic from resurrecting values.

```ts
app.state.set('theme', 'dark')
app.state.get('theme')           // 'dark'
app.state.delete('theme')

app.state.on('theme', (value) => { /* reactive */ })
app.state.on('*', (key, value) => { /* wildcard */ })

app.state.keys()                 // ['theme', 'filter']
app.state.entries()              // [['theme', 'dark'], ['filter', 'open']]
app.state.setAll({ theme: 'dark', filter: 'open' })
```

Values follow structured-clone semantics within bounded message limits. Use `delete`
for absence because `set(key, undefined)` is rejected. `setAll` validates and sends one
atomic batch; all keys are installed before ordered key and wildcard notifications.

State lives in memory only. Persistence is your responsibility:

```ts
app.state.on('*', () => {
  localStorage.setItem('my-state', JSON.stringify(Object.fromEntries(app.state.entries())))
})
```

### Views

A view is a named region that one tab holds at a time. Think "editor", "preview", "settings" — each can only be claimed by a single tab.

```ts
// Tab A: open a view in a new tab
const handle = await app.open('editor', {
  url: '/editor',
  syncKeys: ['theme']  // pre-sync selected UI state to the new tab
})

// Tab B (at /editor): claim the view
const claim = await app.claim('editor')
if (claim.status === 'conflict') console.log('Already owned by', claim.owner)

// React to view lifecycle
app.on('view:claimed', ({ name, tab, token }) => { })
app.on('view:vacant', ({ name, token }) => { })
app.on('view:conflict', ({ name, existing, incoming }) => { })
```

### Presence

Every tab is tracked. Presence combines announcements with bounded storage leases and
remains an eventual liveness estimate under browser suspension.

```ts
app.tabs.list()      // TabMeta[] — all connected tabs
app.tabs.current()   // TabMeta — this tab
app.tabs.leader()    // TabMeta | null — current leader

app.on('tab:join', (tab) => { })
app.on('tab:leave', (tab) => { })
```

### Leader election

One tab holds an exclusive, namespace-scoped Web Lock for its complete leader interval.
The browser controls contender ordering; Tabula does not promise oldest-tab or FIFO
selection. Presence and `tabs.leader()` expose the latest fenced holder projection,
but only the held lock authorizes leader work.

```ts
app.onLeader(() => {
  // Runs when this tab becomes leader
  const interval = setInterval(fetchNotifications, 30000)
  return () => clearInterval(interval) // cleanup on demotion
})

app.isLeader()  // boolean
app.on('leader:change', ({ tab, isMe }) => { })
```

`onLeader` setup runs only while that tab holds the lock, and voluntary release runs its
cleanup before the lock is released. A frozen holder may retain its lock, so Tabula does
not steal leadership after a timeout. Crashes cannot run JavaScript cleanup, and
exactly-once effects still require server-side idempotency or locking.

### Lifecycle

```ts
await app.ready

const status = app.status()
// { lifecycle: 'ready', sync: 'complete', missingPeerIds: [] }

app.on('sync:status', (nextStatus) => { })
app.destroy()
```

Initialization uses one bounded readiness budget (default `1000` ms of runnable timer
time). `ready` can resolve with `sync: 'repairing'`; inspect `status()` or subscribe to
`sync:status` when completeness matters. Mutations made while initializing or suspended
in the back/forward cache are queued in call order.

State startup uses correlated rounds and merges complete snapshots from every known
live responder. A delayed, busy, or suspended peer cannot hold usability past the
readiness budget: repair continues with bounded backoff and on peer activity, and late
retained replies still merge values and tombstones before status becomes `complete`.

`destroy()` is terminal and idempotent. Destroying before readiness rejects `ready` with
`WorkspaceDestroyedError`; asynchronous startup failure rejects it with
`WorkspaceFailedError`. All operations except `status()` and repeated `destroy()` throw
the matching terminal error afterward.

## Framework integration

Tabula v1 is framework-neutral and does not ship framework wrappers. React
applications can subscribe directly with React's built-in external-store API:

```tsx
import { useSyncExternalStore } from 'react'
import { createWorkspace } from '@farooqalaulddin/tabula-js'

const workspace = createWorkspace<AppState>('my-app')

function ThemeToggle() {
  const theme = useSyncExternalStore(
    onStoreChange => workspace.state.on('theme', onStoreChange),
    () => workspace.state.get('theme') ?? 'light',
  )
  return (
    <button onClick={() => workspace.state.set('theme', theme === 'dark' ? 'light' : 'dark')}>
      {theme}
    </button>
  )
}
```

## Testing

Tabula ships test utilities that simulate multi-tab coordination in Node.js — no browser required.

```bash
import { createMockWorkspace, createTestCluster } from '@farooqalaulddin/tabula-js/testing'
```

### Single tab

```ts
const workspace = createMockWorkspace<MyState>()
workspace.state.set('theme', 'dark')
expect(workspace.state.get('theme')).toBe('dark')
```

### Multi-tab

```ts
const cluster = createTestCluster<MyState>('test')
const tab1 = cluster.createTab()
const tab2 = cluster.createTab()

tab1.state.set('count', 1)
expect(tab2.state.get('count')).toBe(1)
expect(tab1.isLeader()).toBe(true)   // deterministic oldest-created test simulation
expect(tab2.isLeader()).toBe(false)
```

The test cluster deliberately chooses the oldest-created mock tab. Browser workspaces
use Web Locks, whose request ordering is controlled by the browser.

## Real-world example

The [`example-excalidraw`](./packages/example-excalidraw) package demonstrates one
exclusive named canvas editor feeding a read-only dashboard mirror. The scene is not
collaboratively merged; allowing multiple editors to write it would be unsafe LWW use.

```
pnpm example:excalidraw
```

Features demonstrated:

- One claimed full-screen canvas edits the scene
- The dashboard renders a read-only scene mirror
- Theme, presence, leadership, and view state use the core directly

## How it works

Tabula uses three browser APIs for coordination:

- **BroadcastChannel** — real-time messaging between tabs (namespaced per workspace)
- **localStorage** — view/presence projections, fenced generations, and expiring open-intent metadata
- **Web Locks** — exclusive leadership authority

No WebSocket. No server. No polling. Everything happens client-side within the same origin.

### Architecture

```
Layer 4 — Public API      createWorkspace(), Workspace interface
Layer 3 — Coordinator     Startup sequencing, event translation, queue
Layer 2 — Domain          Presence, Leader, State, Views
Layer 1 — Transport       BroadcastChannel, localStorage, Dedup
```

### Message protocol

Tabula uses 13 domain message types plus identity and compatibility control messages:

```
identity:probe · identity:claim
tab:announce · tab:heartbeat · tab:leave
state:sync-request · state:sync · state:set · state:delete · state:batch
view:claim · view:claimed · view:release · view:conflict · view:focus · view:intent-claim · view:intent-state
leader:query · leader:change
protocol:reject
```

Every message uses a validated, versioned envelope:
`{ protocol, type, id, from: { tabId, instanceId }, to?, sentAt, payload }`.
Revision 1 readers accept revision 0, reject unsupported version ranges, and emit one
`protocol:incompatible` event with the recovery action for each peer/version episode.
Malformed, misdirected, duplicate, or oversized traffic is dropped before domain code.
State synchronization uses request ids and initialization generations so only retained
matching rounds can change synchronization status.

## API reference

### `createWorkspace<S>(namespace, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `namespace` | `string` | Workspace identifier. Tabs with the same namespace coordinate together. |
| `options.heartbeat` | `number` | Presence heartbeat interval in ms. Default: `1500`. |
| `options.timeout` | `number` | Time before a silent tab is pruned. Default: `5000`. |
| `options.readyTimeout` | `number` | Total initial discovery/sync budget in runnable ms. Default: `1000`. |
| `options.openTimeout` | `number` | Open-intent claim timeout in ms. Default: `10000`. |

Returns `Workspace<S>`.

### `Workspace<S>`

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `ready` | `Promise<void>` | Resolves when init is complete. |
| `status()` | `WorkspaceStatus` | Immutable lifecycle and synchronization snapshot. |
| `state` | `WorkspaceState<S>` | Shared state API. |
| `views` | `WorkspaceViews` | View registry queries. |
| `tabs` | `WorkspaceTabs` | Presence information. |
| `claim(name)` | `Promise<ViewClaimResult>` | Atomically claim a view or return its projected owner. |
| `open(name, opts)` | `Promise<ViewHandle>` | Open a view in a new tab. |
| `focus(name)` | `void` | Focus the tab holding a view. |
| `onLeader(setup)` | `() => void` | Register leader callback. Returns unsubscribe. |
| `isLeader()` | `boolean` | Whether this tab is the leader. |
| `on(event, cb)` | `() => void` | Subscribe to events. Returns unsubscribe. |
| `destroy()` | `void` | Full teardown. |

### `WorkspaceState<S>`

| Method | Description |
|--------|-------------|
| `set(key, value)` | Set a key. Broadcasts to all tabs. |
| `get(key)` | Get current value. |
| `on(key, cb)` | Subscribe to changes. Returns unsubscribe. |
| `on('*', cb)` | Wildcard — fires on any key change. |
| `delete(key)` | Delete a key. Broadcasts to all tabs. |
| `keys()` | Returns array of set keys. |
| `entries()` | Returns `[key, value]` pairs. |
| `setAll(partial)` | Atomically set multiple keys before ordered notifications. |

### `ViewClaimResult` and `ViewHandle`

`claim(name)` resolves to `{ status: 'claimed', handle }` or
`{ status: 'conflict', owner }`. Conflict is expected; claiming a different view
while the tab owns one rejects with `ViewAlreadyClaimedError`.

Both successful `claim()` and `open()` return a handle with readonly `name`, `owner`,
and `{ generation, claimId }` token properties. `release()` and `focus()` target only
that token, so stale handles cannot control a replacement claim. `on('vacant', cb)`
and `on('conflict', cb)` return unsubscribe functions.

### Events

| Event | Payload | When |
|-------|---------|------|
| `tab:join` | `TabMeta` | A tab connects to the workspace. |
| `tab:leave` | `TabMeta` | A tab disconnects (close, crash, timeout). |
| `leader:change` | `{ tab: TabMeta, isMe: boolean }` | Leadership changes. |
| `view:claimed` | `{ name, tab, token }` | A fenced view claim is projected. |
| `view:vacant` | `{ name, token }` | That exact ownership term becomes vacant. |
| `view:conflict` | `{ name, existing, incoming, token? }` | A claim encounters an owner projection. |

### `TabMeta`

```ts
interface TabMeta {
  id: string          // Unique tab identifier (persists across refresh)
  view: string | null // Claimed view name, if any
  visible: boolean    // Whether the tab is in the foreground
  firstSeenAt: number // Timestamp when the tab first connected
  lastSeenAt: number  // Timestamp of the last heartbeat
}
```

## Runtime prerequisites

Tabula 1.0 targets desktop applications running in top-level, same-origin browser
contexts. Every participating page must provide:

- a secure context with the Web Locks API;
- `BroadcastChannel` and `crypto.randomUUID()`;
- usable `localStorage` and `sessionStorage`; and
- the same origin and workspace namespace as the tabs it coordinates.

Iframes are not supported. Storage-blocked or capability-limited contexts cannot
join a workspace. Tabula does not provide storage, Web Locks, or BroadcastChannel
polyfills. Automated release evidence currently covers current Chromium, Firefox,
and Playwright WebKit; a real Safari/macOS pass remains required before 1.0 RC.

## Security

Tabula trusts all scripts on the same origin. Keep in mind:

- Shared state should be treated as untrusted UI hints — validate server-side.
- Never store auth tokens, API keys, or raw PII in shared state.
- XSS on any page compromises all tabs in the workspace.
- Any same-origin script can observe all Tabula traffic.
- Protocol validation limits malformed traffic; it does not authenticate same-origin peers.

## Packages

| Package | Description | Size |
|---------|-------------|------|
| `@farooqalaulddin/tabula-js` | Core library. Zero dependencies. | Gated before preview publication |
| `@farooqalaulddin/tabula-js/testing` | Test utilities. In-memory multi-tab simulation. | Included in core |

## License

[MIT](./LICENSE)
