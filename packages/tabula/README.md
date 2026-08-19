# Tabula

**Coordinate browser tabs as views of one workspace.**

`@farooqalaulddin/tabula-js` is a framework-neutral browser coordination library
with zero runtime dependencies. It provides typed ephemeral state, presence,
Web-Lock-authorized leader work, and exclusive named views for same-origin desktop
web applications.

[Open the live multi-tab demo](https://farooqalaulddin.github.io/tabula-js/).

## Install

```bash
npm install @farooqalaulddin/tabula-js
```

The package ships ESM, CommonJS, TypeScript declarations, source maps, and the
`@farooqalaulddin/tabula-js/testing` subpath.

## Quick start

```ts verify=browser
import { createWorkspace } from '@farooqalaulddin/tabula-js'

interface AppState {
	theme: 'light' | 'dark'
	filter: 'all' | 'open'
}

const workspace = createWorkspace<AppState>('my-app')
await workspace.ready

workspace.state.on('theme', (theme) => {
	document.documentElement.dataset.theme = theme
})
workspace.state.set('theme', 'dark')

workspace.onLeader(() => {
	document.documentElement.dataset.backgroundOwner = workspace.tabs.current().id
	return () => {
		delete document.documentElement.dataset.backgroundOwner
	}
})

workspace.on('tab:join', (tab) => console.log(`${tab.id} joined`))
workspace.on('tab:leave', (tab) => console.log(`${tab.id} left`))
```

Tabs coordinate when they use the same workspace namespace on the same origin.

## Behavioral contract

### Workspace and lifecycle

`createWorkspace(namespace, options?)` validates the runtime before attaching any
resources. Mutations issued while initialization or bfcache suspension is in progress
are queued in call order.

`ready` has one bounded initial budget (`readyTimeout`, 1000 ms by default). It means
the workspace is usable, not necessarily that every suspended peer replied. Inspect
`status().sync` or subscribe to `sync:status`; a `repairing` workspace continues bounded
multi-peer synchronization until live responders reply or leave.

`destroy()` is terminal and idempotent. Destroy before readiness rejects `ready` with
`WorkspaceDestroyedError`; asynchronous coordination failure rejects it with
`WorkspaceFailedError`. After either terminal state, only `status()` and repeated
`destroy()` are valid.

### Shared state

State is typed, in memory, and same-origin. `set` and `delete` use a hybrid logical
clock plus actor and operation-id tie breakers, so peers receiving the same validated
operations choose the same last-write-wins result. Deletes retain cohort-lifetime
tombstones so delayed messages cannot resurrect removed values.

Values follow structured-clone semantics within protocol bounds. `undefined` means
absence and is rejected by `set`; use `delete`. Clone or transport failure leaves local
state unchanged. `setAll` validates and sends one atomic batch, installs all keys, then
notifies key listeners in lexical order followed by wildcard listeners.

```ts verify=ts
import { createWorkspace } from '@farooqalaulddin/tabula-js'

interface UiState {
	theme: 'light' | 'dark'
	filter: 'all' | 'open'
}

const workspace = createWorkspace<UiState>('state-example')
workspace.state.set('theme', 'dark')
workspace.state.get('theme')
workspace.state.delete('filter')
workspace.state.setAll({ theme: 'light', filter: 'open' })
workspace.state.on('theme', (theme) => console.log(theme))
workspace.state.on('*', (key, value) => console.log(key, value))
workspace.state.keys()
workspace.state.entries()
```

State is not durable and is not a collaborative document data type. Do not use
multiple LWW writers for rich text, drawing scenes, or other merge-sensitive content.

### Named views

A named view such as `editor`, `preview`, or `settings` has at most one Web Lock holder.
`claim()` resolves with a claimed handle or an expected conflict result. `open()` creates
a pending handoff, transfers only selected validated state operations, and rejects if
the browser blocks the popup or the claim misses `openTimeout` (10 seconds by default).

Successful handles contain an ownership token. `release()`, `focus()`, vacancy, and
conflict observation are fenced to that term, so stale handles cannot control a newer
claim. The localStorage registry is a discovery projection, not authority.

```ts verify=ts
import { createWorkspace } from '@farooqalaulddin/tabula-js'

interface EditorState {
	theme: 'light' | 'dark'
	draftTitle: string
}

const workspace = createWorkspace<EditorState>('views-example')

document.querySelector<HTMLButtonElement>('#open-editor')?.addEventListener('click', async () => {
	if (workspace.views.has('editor')) {
		workspace.focus('editor')
		return
	}
	const handle = await workspace.open('editor', {
		url: '/editor',
		syncKeys: ['theme', 'draftTitle'],
	})
	handle.on('vacant', () => console.log('editor closed'))
})

async function initializeEditorPage() {
	await workspace.ready
	const claim = await workspace.claim('editor')
	if (claim.status === 'conflict') console.log('owned by', claim.owner)
	else claim.handle.on('conflict', (event) => console.log(event.incoming))
}

void initializeEditorPage()
```

Call `open()` from a direct user gesture. `focus()` is a request; the browser decides
whether another tab is foregrounded.

### Presence and leadership

Presence combines announcements with bounded storage leases. It is an eventual
liveness estimate, not an instantaneous crash detector. Browser suspension, sleep,
and scheduling delay extend observation time.

Leadership is authoritative only while one tab holds the namespace Web Lock. Browser
lock scheduling does not promise oldest-tab or FIFO selection. `onLeader` setup runs
only for the holder; voluntary transfer runs cleanup before releasing the lock. A
frozen holder may retain authority. External side effects must be restartable and
idempotent; exactly-once work requires server authority.

## Framework integration

Tabula v1 has no React wrapper. React applications subscribe directly to the core
using React's external-store API:

```tsx verify=react
import { createWorkspace } from '@farooqalaulddin/tabula-js'
import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'

interface AppState {
	theme: 'light' | 'dark'
}

const workspace = createWorkspace<AppState>('react-example')
const subscribeTheme = (notify: () => void) => workspace.state.on('theme', notify)
const readTheme = () => workspace.state.get('theme') ?? 'light'

function ThemeToggle() {
	const theme = useSyncExternalStore(subscribeTheme, readTheme, readTheme)
	return (
		<button
			type="button"
			onClick={() => workspace.state.set('theme', theme === 'dark' ? 'light' : 'dark')}
		>
			{theme}
		</button>
	)
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<ThemeToggle />)
```

The same subscription boundary works with other frameworks. Components receive normal
values and callbacks; no Tabula-specific UI layer is required.

## Testing

The `testing` subpath provides a deterministic in-memory workspace and multi-tab
cluster for Node.js tests. It simulates state, presence, leader identity, named views,
and events. The oldest-created mock tab is leader; real browsers use Web Locks and do
not promise that ordering.

### ESM

```mjs verify=esm
import assert from 'node:assert/strict'
import { createWorkspace } from '@farooqalaulddin/tabula-js'
import {
	createMockWorkspace,
	createTestCluster,
} from '@farooqalaulddin/tabula-js/testing'

assert.equal(typeof createWorkspace, 'function')
const single = createMockWorkspace()
single.state.set('theme', 'dark')
assert.equal(single.state.get('theme'), 'dark')

const cluster = createTestCluster('esm-example')
const first = cluster.createTab()
const second = cluster.createTab()
first.state.set('count', 1)
assert.equal(second.state.get('count'), 1)
assert.equal(first.isLeader(), true)
```

### CommonJS

```cjs verify=cjs
const assert = require('node:assert/strict')
const { createWorkspace } = require('@farooqalaulddin/tabula-js')
const {
	createMockWorkspace,
	createTestCluster,
} = require('@farooqalaulddin/tabula-js/testing')

assert.equal(typeof createWorkspace, 'function')
const single = createMockWorkspace()
single.state.set('theme', 'light')
assert.equal(single.state.get('theme'), 'light')
assert.equal(typeof createTestCluster('cjs-example').createTab, 'function')
```

Use real browser tests as well for Web Locks, popup/focus policy, storage events,
bfcache, and scheduling behavior.

## Canonical API reference

This section is the single canonical reference for package exports. Protocol message
envelopes, synchronization payloads, storage records, and state-operation internals
are intentionally not exported.

### Main export

<!-- api-table:main:start -->
| Symbol | Kind | Purpose |
|--------|------|---------|
| `createWorkspace` | function | Create and synchronously validate a browser workspace. |
| `Workspace` | type | Complete workspace interface. |
| `WorkspaceOptions` | type | Heartbeat, timeout, readiness, and open-timeout options. |
| `WorkspaceState` | type | Typed state reads, writes, deletion, batching, and subscriptions. |
| `WorkspaceViews` | type | Named-view registry queries. |
| `WorkspaceTabs` | type | Presence and projected leader queries. |
| `WorkspaceEventMap` | type | Payload map used by `on` and `off`. |
| `WorkspaceStatus` | type | Immutable lifecycle, sync, and missing-peer snapshot. |
| `WorkspaceLifecycle` | type | Workspace lifecycle state union. |
| `WorkspaceSyncState` | type | `pending`, `repairing`, or `complete`. |
| `TabMeta` | type | Public tab identity, visibility, view, and liveness metadata. |
| `ViewOpenOptions` | type | URL and selected state keys for `open()`. |
| `ViewClaimResult` | type | Claimed-handle or expected-conflict result. |
| `ViewHandle` | type | Token-fenced view control and event subscriptions. |
| `ViewClaimToken` | type | Generation and claim identifier for one ownership term. |
| `ViewClaimedEvent` | type | Projected view claim payload. |
| `ViewVacantEvent` | type | Token-fenced vacancy payload. |
| `ViewConflictEvent` | type | Existing and incoming claimant payload. |
| `LeaderChangeEvent` | type | Projected leader identity and local-holder flag. |
| `ProtocolVersion` | type | Major/revision compatibility range. |
| `ProtocolIncompatibleEvent` | type | Peer/version/recovery payload for incompatible deployments. |
| `CapabilityError` | class | Required browser capability is unavailable. |
| `StorageOperationError` | class | A storage read/write/remove failed atomically. |
| `StorageCorruptionError` | class | An authoritative storage record is corrupt. |
| `ViewAlreadyClaimedError` | class | This tab attempted to own a second named view. |
| `WorkspaceDestroyedError` | class | An operation targeted a destroyed workspace. |
| `WorkspaceFailedError` | class | Coordination entered a terminal failed state. |
<!-- api-table:main:end -->

### Testing export

<!-- api-table:testing:start -->
| Symbol | Kind | Purpose |
|--------|------|---------|
| `createMockWorkspace` | function | Create one synchronous in-memory workspace. |
| `createTestCluster` | function | Create deterministic coordinated mock tabs. |
| `TestCluster` | type | Cluster interface exposing `createTab()`. |
<!-- api-table:testing:end -->

### Workspace methods

| Member | Contract |
|--------|----------|
| `ready` | Resolves after the bounded initial readiness round; may resolve while sync repairs. |
| `status()` | Returns an immutable lifecycle/synchronization snapshot. |
| `state` | Typed shared-state interface. |
| `views` | Named-view discovery projection. |
| `tabs` | Presence and projected leader interface. |
| `claim(name)` | Atomically acquire a named view or return a conflict. |
| `open(name, options)` | Open/focus a named page and await its fenced claim. |
| `focus(name)` | Request focus from the current projected owner. |
| `onLeader(setup)` | Register holder-only work; returns unsubscribe. |
| `isLeader()` | Whether this tab currently holds the leader lock. |
| `on(event, callback)` | Subscribe to a typed workspace event; returns unsubscribe. |
| `off(event, callback)` | Remove a specific workspace event callback. |
| `destroy()` | Terminal, idempotent teardown. |

### State methods

| Member | Contract |
|--------|----------|
| `set(key, value)` | Validate, clone, commit, and broadcast one value. |
| `get(key)` | Read the current local value. |
| `delete(key)` | Commit and broadcast a convergent tombstone. |
| `setAll(partial)` | Atomically commit a validated multi-key batch. |
| `on(key, callback)` | Subscribe to one key; returns unsubscribe. |
| `on('*', callback)` | Subscribe to all key changes; returns unsubscribe. |
| `keys()` | Return currently present keys. |
| `entries()` | Return current key/value entries. |

### View and tab queries

| Interface | Members |
|-----------|---------|
| `WorkspaceViews` | `get(name)`, `has(name)`, `list()` |
| `WorkspaceTabs` | `list()`, `current()`, `leader()` |
| `ViewHandle` | readonly `name`, `owner`, `token`; `on`, `release`, `focus` |

### Events

| Event | Payload |
|-------|---------|
| `tab:join` | `TabMeta` |
| `tab:leave` | `TabMeta` |
| `leader:change` | `LeaderChangeEvent` |
| `view:claimed` | `ViewClaimedEvent` |
| `view:vacant` | `ViewVacantEvent` |
| `view:conflict` | `ViewConflictEvent` |
| `protocol:incompatible` | `ProtocolIncompatibleEvent` |
| `sync:status` | `WorkspaceStatus` |

### Defaults

| Option | Default | Meaning |
|--------|---------|---------|
| `heartbeat` | `1500` ms | Presence announcement interval. |
| `timeout` | `5000` ms | Base silence threshold; lease retention extends it. |
| `readyTimeout` | `1000` ms | Total runnable initial readiness budget. |
| `openTimeout` | `10000` ms | Pending named-view claim timeout. |

## Runtime and support

Every participant must be a top-level, secure, same-origin browser context with Web
Locks, `BroadcastChannel`, `crypto.randomUUID()`, `structuredClone()`, readable and
writable `localStorage`, and readable and writable `sessionStorage`. Iframes, workers,
SSR execution, storage-blocked contexts, cross-origin coordination, and cross-device
coordination are unsupported. No capability polyfills are bundled.

Automated release evidence covers current Chromium, Firefox, and Playwright WebKit.
Playwright WebKit is not Safari/macOS proof; a dated real Safari pass remains a 1.0 RC
gate. See the
[browser behavior guide](https://github.com/FarooqAlaulddin/tabula-js/blob/main/docs/BEHAVIOR.md)
for exact versions and evidence labels.

## Security and privacy

All scripts on the origin are trusted peers. Tabula validates shape, size, routing,
and protocol compatibility, but it does not authenticate same-origin messages.

- Treat shared state as untrusted UI hints and validate server-side.
- Never store credentials, auth tokens, API keys, raw PII, or authorization decisions.
- XSS on any participant compromises every workspace tab on that origin.
- Projected leader and view identities are observability, not security boundaries.
- Use server-side idempotency/locking for authoritative external effects.

## Non-goals

Tabula does not provide persistence, RPC, cross-origin or cross-device sync, a
BroadcastChannel fallback, UI components, routing, iframes, collaborative editing,
exactly-once work, guaranteed focus, or real-time failure detection.

The normative guarantees and rejection cases are in the
[1.0 behavioral contract](https://github.com/FarooqAlaulddin/tabula-js/blob/main/docs/CONTRACT.md).

## Examples

The [live demo](https://farooqalaulddin.github.io/tabula-js/) exercises state,
presence, leader transfer, exclusive views, focus, vacancy, and logout across multiple
tabs. The
[Excalidraw example](https://github.com/FarooqAlaulddin/tabula-js/tree/main/packages/example-excalidraw)
uses direct React integration: one claimed canvas is editable and the dashboard is a
read-only mirror. It does not claim collaborative scene merging.

## License

[MIT](./LICENSE)
