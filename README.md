# Tabula

**Coordinate browser tabs as views of a single workspace.**

Tabula lets you build web apps that treat multiple tabs as one surface. Shared state, presence tracking, leader election, and named views through modern browser coordination APIs, with zero dependencies.

---

## Why

The browser is already a multi-window manager. It tiles tabs side by side, snaps windows across monitors, restores sessions, and handles focus — natively, accessibly, for free.

Yet web apps keep rebuilding window managers *inside* a single tab: dock layouts, resizable split panes, fake popouts, thousands of lines of drag-and-drop styling — all to show an editor next to a preview.

They do it because the browser gives you the windows but not the coordination. The moment your preview lives in a second tab:

- The tabs share no memory — every pane-in-a-div pattern breaks.
- Each tab opens its own WebSocket and polls the same API.
- User logs out in one tab — the other doesn't know.
- There's no way to say "the editor is already open — focus it, don't reopen it."

So everyone picks the one option where state sharing is trivial — one tab, one JS heap — and pays for it in layout code forever.

Tabula is the missing coordination layer: shared state, presence, leader election, and named views, so your app can expand into real tabs and let the browser do the window management.

### What Tabula is — and isn't

Tabula is deliberately narrow:

- **Thin.** A coordination protocol over BroadcastChannel and localStorage, ~7 KB gzipped. No window manager, no UI, no framework.
- **Removable.** State is a standalone key-value store. Framework components subscribe at their integration boundary and receive ordinary props, so removing Tabula does not require rewriting them.
- **Zero dependencies.** The core has none.
- **Niche by design.** Built for desktop workspace apps — editors with detached previews, trading consoles, monitoring dashboards, creative tools. Not for mobile, not cross-origin, not a persistence layer. The full non-goals list is in [DECISIONS.md](./DECISIONS.md).

If your app is a single-surface SPA, you don't need Tabula — until the day one of the pains above shows up, and then you can adopt exactly one feature ([adopting Tabula](#adopting-tabula)) without restructuring anything.

## Install

```bash
npm install @farooqalaulddin/tabula-js
```

## Quick start

```ts
import { createWorkspace } from '@farooqalaulddin/tabula-js'

interface AppState {
  theme: 'light' | 'dark'
  draft: string
}

const app = createWorkspace<AppState>('my-app')

await app.ready

// Shared state — syncs to all tabs
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

Tabs coordinate when they use the same workspace namespace on the same origin.

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

Calls that mutate state or claim a view before initialization are queued. Await `ready` when subsequent code depends on initial presence discovery, state sync, or leader selection.

### Shared state

A typed key-value store that syncs across tabs in real time.

```ts
app.state.set('theme', 'dark')
app.state.get('theme')           // 'dark'
app.state.delete('theme')

app.state.on('theme', (value) => { /* reactive */ })
app.state.on('*', (key, value) => { /* wildcard */ })

app.state.keys()                 // ['theme', 'draft']
app.state.entries()              // [['theme', 'dark'], ['draft', '']]
app.state.setAll({ theme: 'dark', draft: '' })
```

Two properties to design around:

- **Conflict resolution is deterministic last-write-wins.** Set and delete operations use a hybrid logical clock plus actor and operation-id tie breakers, so every delivery order selects the same winner. Deletes retain an in-memory tombstone while the workspace lives, preventing delayed traffic or stale sync from resurrecting a value. There is no field merging or CRDT.
- **Values use structured-clone semantics.** Cycles, maps, sets, dates, and binary values are supported within documented limits. `undefined` represents absence and is rejected by `set`; use `delete`. Clone or send failure leaves local state unchanged.
- **`setAll` is one atomic batch.** Every key is installed before key listeners run in lexical order, followed by wildcard listeners. Validation or send failure commits nothing.
- **State lives in memory only.** When the last tab closes, it's gone. Persistence is deliberately your responsibility, in whatever store you already use:

```ts
app.state.on('*', () => {
  localStorage.setItem('my-state', JSON.stringify(Object.fromEntries(app.state.entries())))
})
```

### Views

A view is a named region that one tab holds at a time. Think "editor", "preview", "settings" — each can only be claimed by a single tab.

The browser almost has this: `window.open('/editor', 'editor')` reuses a named window. But a name is all you get — no event when the view is claimed or vacated, no way to ask which tab holds it, no signal when two tabs collide, no reliable "focus it, don't reopen it." Views add exactly that coordination:

```ts
// Tab A: open a view in a new tab
const handle = await app.open('editor', {
  url: '/editor',
  syncKeys: ['draft', 'theme']  // pre-sync these keys to the new tab
})

// Tab A: or focus it if it's already open
if (app.views.has('editor')) app.focus('editor')

// Tab B (at /editor): claim the view without waiting on a conflict
const claim = await app.claim('editor')
if (claim.status === 'conflict') {
  console.log('Already owned by', claim.owner)
} else {
  claim.handle.on('vacant', () => console.log('editor released'))
}

// React to view lifecycle
app.on('view:claimed', ({ name, tab, token }) => { })
app.on('view:vacant', ({ name, token }) => { })
app.on('view:conflict', ({ name, existing, incoming }) => { })
```

`syncKeys` transfers selected state operations through the validated protocol without putting application state in the URL or localStorage. `open()` keeps only expiring intent metadata in localStorage and rejects after `openTimeout` (10 seconds by default).

The registry can be queried from any tab:

```ts
app.views.get('editor') // TabMeta | null — who holds it
app.views.has('editor') // boolean
app.views.list()        // Record<string, TabMeta>
```

The handle returned by `open()` or a successful `claim()` is fenced to that exact ownership term:

```ts
const stop = handle.on('vacant', () => console.log('editor closed'))

handle.focus()
handle.release()
stop()
```

The localStorage registry is a discovery projection, not ownership authority. An exclusive per-view Web Lock is authoritative. Refresh reacquires with a new token; crashes rely on browser lock release; and frozen tabs retain ownership until the browser releases their lock.

Two browser realities apply: call `open()` from a user gesture so popup blocking doesn't eat the new tab, and treat `focus()` as a request — browsers retain final control over whether a script may focus another tab.

### Presence

Every tab is tracked. Presence survives Chrome's background timer throttling through localStorage-based heartbeats.

```ts
app.tabs.list()      // TabMeta[] — all connected tabs
app.tabs.current()   // TabMeta — this tab
app.tabs.leader()    // TabMeta | null — current leader

app.on('tab:join', (tab) => { })
app.on('tab:leave', (tab) => { })
```

Presence is still a liveness estimate. Browser scheduling, crashes, and suspension mean failure detection cannot be instantaneous.

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
not steal leadership after a timeout. Write leader work to be **idempotent and cheap to
restart**. Crashes cannot run JavaScript cleanup, and exactly-once effects still require
server-side idempotency or locking.

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

After presence discovery, state synchronization uses correlated rounds and merges
complete snapshots from every known live responder. Missing or suspended peers do not
block usability past the readiness budget: Tabula reports `repairing`, retries with
bounded backoff, and moves to `complete` after peer responses or presence removal.
Late retained responses still merge, including delete tombstones.

`destroy()` is terminal and idempotent. Destroying before readiness rejects `ready` with
`WorkspaceDestroyedError`; asynchronous startup failure rejects it with
`WorkspaceFailedError`. All operations except `status()` and repeated `destroy()` throw
the matching terminal error afterward.

## Guarantees and tradeoffs

Tabula makes deliberate tradeoffs. Know them before you depend on it:

| Property | What Tabula does | What that means for you |
|----------|------------------|-------------------------|
| Leadership | One exclusive Web Lock holder | Browser-controlled ordering; frozen holders are not replaced, and exactly-once effects still need server authority. |
| State | In-memory, last-write-wins | No durability, no merging. Persist what matters yourself; don't build collaborative text editing on it. |
| New-tab sync | Correlated multi-peer rounds with bounded post-ready repair | `await app.ready` bounds usability, not guaranteed completeness. Check `status().sync` or `sync:status`; delayed and resumed peers continue repairing values and tombstones. |
| Focus & popups | `open()` and `focus()` go through browser policy | Call `open()` from a user gesture; treat `focus()` as a request, not a guarantee. |
| Scope | Same origin, same browser, same device | Not a server sync, not cross-device, not cross-origin. |

If your requirements are stricter than this — durable state, guaranteed single execution, cross-device — you need a server, not a tab-coordination library.

## Adopting Tabula

### Existing apps: one feature at a time

Don't restructure anything. Pick the single pain you actually have, wire that one feature, and stop:

1. **Lowest stakes first.** Leader-elect your WebSocket so ten tabs open one connection instead of ten. Or broadcast logout so signing out in one tab signs out all of them. Both are a few lines, touch no components, and fail soft.
2. **Then shared UI state** — theme, filters, drafts — through `workspace.state`.
3. **Views last.** Detaching a panel into its own tab is the biggest payoff but also the biggest product decision; do it once the plumbing has earned trust.

Each step is independently removable: delete the subscription boundary, keep the component.

### Fresh apps: only if multi-window is the product

Design around the workspace model from day one **only** if multi-window is part of your product's identity — an editor whose preview belongs on a second monitor, a trading console, a monitoring wall. If multiple tabs are merely possible rather than central, build a normal SPA and adopt features from the list above when a real pain appears.

### Gradual adoption in components

Components receive plain props and never know they're multi-tab:

```tsx
// Your existing component — unchanged
function EditorPanel({ content, onChange }) {
  return <textarea value={content} onChange={e => onChange(e.target.value)} />
}

// Integration boundary — direct core subscription
function SyncedEditor() {
	const content = useSyncExternalStore(
		onStoreChange => workspace.state.on('draft', onStoreChange),
		() => workspace.state.get('draft') ?? '',
	)
	return <EditorPanel content={content} onChange={value => workspace.state.set('draft', value)} />
}
```

Removing Tabula is deleting `SyncedEditor`, not rewriting `EditorPanel`.

## Framework integration

Tabula v1 is framework-neutral and does not ship framework wrappers. React applications
can subscribe to the core workspace with React's built-in external-store API:

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

Multi-tab behavior is notoriously hard to test — most teams either skip it or script real browsers. Tabula ships test utilities that simulate a whole tab cluster in Node.js, so cross-tab logic runs in your ordinary unit test suite:

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

tab2.claim('preview')
expect(tab1.views.has('preview')).toBe(true)
```

The cluster simulates state, presence, leadership, view claims, and events synchronously
in memory. It chooses the oldest-created mock tab deterministically; real browsers choose
Web Lock request ordering. Use browser-level tests as well when behavior depends on real
locks, popup policies, focus, storage events, or browser scheduling.

## Real-world example

The [`example-excalidraw`](./packages/example-excalidraw) package demonstrates Tabula integrated with [Excalidraw](https://excalidraw.com) — a popular open-source whiteboard. Zero changes to Excalidraw's code. A thin wrapper syncs drawing data across tabs via Tabula's shared state.

```
pnpm example:excalidraw
```

Features demonstrated:

- Drawing syncs between dashboard and full-screen canvas tab
- Theme syncs via `useSharedState`
- Tab presence via `useTabPresence`
- Leader election via `useLeader`
- View claiming via `useTabView`

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
State sync requests and replies also carry a request id and initialization generation;
only retained matching rounds affect synchronization status.

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
| `claim(name)` | `Promise<ViewClaimResult>` | Atomically claim a view or return its current projected owner. |
| `open(name, opts)` | `Promise<ViewHandle>` | Open a view in a new tab. |
| `focus(name)` | `void` | Request focus for the tab holding a view. |
| `onLeader(setup)` | `() => void` | Register leader callback. Returns unsubscribe. |
| `isLeader()` | `boolean` | Whether this tab is the leader. |
| `on(event, cb)` | `() => void` | Subscribe to events. Returns unsubscribe. |
| `off(event, cb)` | `void` | Remove a specific event callback. |
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

### `WorkspaceViews`

| Method | Description |
|--------|-------------|
| `get(name)` | Returns the `TabMeta` holding a view, or `null`. |
| `has(name)` | Whether a view is currently claimed. |
| `list()` | Returns the named-view registry as `Record<string, TabMeta>`. |

### `WorkspaceTabs`

| Method | Description |
|--------|-------------|
| `list()` | All currently known tabs. |
| `current()` | Metadata for this tab. |
| `leader()` | Current leader metadata, or `null`. |

### `ViewHandle`

Returned by `open()` and successful `claim()` results.

`ViewClaimResult` is `{ status: 'claimed', handle: ViewHandle }` or
`{ status: 'conflict', owner: TabMeta | null }`. Conflict is an expected result;
claiming a different view while this tab already owns one rejects with
`ViewAlreadyClaimedError`.

| Property / Method | Description |
|-------------------|-------------|
| `name` | View name captured by this handle. |
| `token` | `{ generation, claimId }` fencing this ownership term. |
| `owner` | `TabMeta` for the owner captured by this handle. |
| `on('vacant', cb)` | Subscribe to vacancy of this view. Returns unsubscribe. |
| `on('conflict', cb)` | Subscribe to claim conflicts on this view. Returns unsubscribe. |
| `release()` | Release the view claim. |
| `focus()` | Request focus for the tab holding the view. |

### Events

| Event | Payload | When |
|-------|---------|------|
| `tab:join` | `TabMeta` | A tab connects to the workspace. |
| `tab:leave` | `TabMeta` | A tab disconnects (close, crash, timeout). |
| `leader:change` | `{ tab: TabMeta, isMe: boolean }` | Leadership changes. |
| `view:claimed` | `{ name, tab, token }` | A fenced view claim is projected. |
| `view:vacant` | `{ name, token }` | That exact ownership term becomes vacant. |
| `view:conflict` | `{ name, existing, incoming, token? }` | A claim encounters an existing owner projection. |

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
polyfills. The tested browser-version matrix will be published before 1.0 rather
than inferred from individual API compatibility tables.

## Security

Tabula trusts all scripts on the same origin. Keep in mind:

- Shared state should be treated as untrusted UI hints — validate server-side.
- Never store auth tokens, API keys, or raw PII in shared state.
- XSS on any page compromises all tabs in the workspace.
- Any same-origin script can observe all Tabula traffic.
- Leader identity is based on self-reported presence metadata and is not a security boundary.
- Protocol validation limits malformed traffic; it does not authenticate same-origin peers.

## Packages

| Package | Description | Size |
|---------|-------------|------|
| [`@farooqalaulddin/tabula-js`](./packages/tabula) | Core library. Zero dependencies. | ~7 KB gzipped |
| [`@farooqalaulddin/tabula-js/testing`](./packages/tabula/src/testing.ts) | Test utilities. In-memory multi-tab simulation. | Included in core |

## Development

The repository and release workflow use pnpm `11.5.0`, pinned by the root
`packageManager` field. Release verification uses that exact version with
`pnpm install --frozen-lockfile`.

## License

[MIT](./LICENSE)
