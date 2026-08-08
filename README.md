# Tabula

**Coordinate browser tabs as views of a single workspace.**

Tabula lets you build web apps that treat multiple tabs as one surface. Shared state, presence tracking, leader election, and named views — all through the BroadcastChannel API with zero dependencies.

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

- **Conflict resolution is last-write-wins** by timestamp (then tab id, then version for same-millisecond writes). There is no merging and no CRDT. This is the right tool for UI state — theme, selection, filters, a draft pointer — and the wrong tool for concurrent edits to the same document body.
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

// Tab B (at /editor): claim the view
app.claim('editor')

// React to view lifecycle
app.on('view:claimed', ({ name, tab }) => { })
app.on('view:vacant', ({ name }) => { })
app.on('view:conflict', ({ name, existing, incoming }) => { })
```

`syncKeys` stages selected current values for the newly opened tab without putting application state in the URL.

The registry can be queried from any tab:

```ts
app.views.get('editor') // TabMeta | null — who holds it
app.views.has('editor') // boolean
app.views.list()        // Record<string, TabMeta>
```

The handle returned by `open()` controls that view and subscribes to its lifecycle:

```ts
const stop = handle.on('vacant', () => console.log('editor closed'))

handle.focus()
handle.release()
stop()
```

The view registry lives in localStorage, so it survives refreshes; if the holding tab dies without releasing, presence timeout vacates the view automatically.

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

The oldest tab is the leader. There is no voting protocol: leadership is derived from presence tracking, so it needs no extra machinery and recalculates automatically on every join and leave.

```ts
app.onLeader(() => {
  // Runs when this tab becomes leader
  const interval = setInterval(fetchNotifications, 30000)
  return () => clearInterval(interval) // cleanup on demotion
})

app.isLeader()  // boolean
app.on('leader:change', ({ tab, isMe }) => { })
```

Because leadership rides on heartbeats, handoff is not instantaneous in every case. A graceful close hands over immediately; a crashed or suspended leader is only detected after the presence timeout (default 5 s), and around suspend/wake edges two tabs can briefly disagree about who leads. Write leader work to be **idempotent and cheap to restart** — reconnect a socket, restart a poll timer — not exactly-once. For that class of work (which is what leader election is for), a short gap or a redundant restart is harmless. Correctness-critical operations still need server-side idempotency or locking.

### Lifecycle

```ts
await app.ready   // wait for init (state sync, leader election)
app.destroy()     // full teardown — broadcasts departure, releases views
```

## Guarantees and tradeoffs

Tabula makes deliberate tradeoffs. Know them before you depend on it:

| Property | What Tabula does | What that means for you |
|----------|------------------|-------------------------|
| Leadership | Heartbeat-based, oldest tab wins | Handoff after a crash takes up to `timeout`; make leader work restartable, not exactly-once. |
| State | In-memory, last-write-wins | No durability, no merging. Persist what matters yourself; don't build collaborative text editing on it. |
| New-tab sync | Requests state, waits for first response or 150 ms | If every other tab is frozen or busy past the window, the new tab starts empty and converges as messages arrive. `await app.ready` covers this window. |
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
expect(tab1.isLeader()).toBe(true)   // oldest tab is leader
expect(tab2.isLeader()).toBe(false)

tab2.claim('preview')
expect(tab1.views.has('preview')).toBe(true)
```

The cluster simulates state, presence, leadership, view claims, and events synchronously in memory. Use browser-level tests as well when behavior depends on real popup policies, focus, storage events, or browser scheduling.

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

Tabula uses two browser APIs for coordination:

- **BroadcastChannel** — real-time messaging between tabs (namespaced per workspace)
- **localStorage** — durable view registry, presence heartbeats, and pending-open data for new tabs

No WebSocket. No server. No polling. Everything happens client-side within the same origin.

### Architecture

```
Layer 4 — Public API      createWorkspace(), Workspace interface
Layer 3 — Coordinator     Startup sequencing, event translation, queue
Layer 2 — Domain          Presence, Leader, State, Views
Layer 1 — Transport       BroadcastChannel, localStorage, Dedup
```

### Message protocol

Tabula uses 13 internal message types:

```
tab:announce · tab:heartbeat · tab:leave
state:sync-request · state:sync · state:set · state:delete
view:claim · view:claimed · view:release · view:conflict · view:focus
leader:change
```

All messages use a shared envelope: `{ type, from, to?, payload, id, ts }`.

## API reference

### `createWorkspace<S>(namespace, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `namespace` | `string` | Workspace identifier. Tabs with the same namespace coordinate together. |
| `options.heartbeat` | `number` | Presence heartbeat interval in ms. Default: `1500`. |
| `options.timeout` | `number` | Time before a silent tab is pruned. Default: `5000`. |
| `options.session` | `boolean` | Clear stale registry entries from earlier browser sessions on startup. Default: `true`. |

Returns `Workspace<S>`.

### `Workspace<S>`

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `ready` | `Promise<void>` | Resolves when init is complete. |
| `state` | `WorkspaceState<S>` | Shared state API. |
| `views` | `WorkspaceViews` | View registry queries. |
| `tabs` | `WorkspaceTabs` | Presence information. |
| `claim(name)` | `void` | Claim a view for this tab. |
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
| `setAll(partial)` | Batch set multiple keys. |

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

Returned by `open()`.

| Method | Description |
|--------|-------------|
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
| `view:claimed` | `{ name: string, tab: TabMeta }` | A view is claimed by a tab. |
| `view:vacant` | `{ name: string }` | A view is released or its holder disconnected. |
| `view:conflict` | `{ name, existing, incoming }` | Two tabs claim the same view. |

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
