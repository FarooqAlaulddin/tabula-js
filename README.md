# Tabula

**Coordinate browser tabs as views of one workspace.**

Tabula is a small, framework-neutral coordination library for desktop web
applications that use multiple same-origin tabs or windows. It provides typed
ephemeral state, presence, one leader for restartable background work, and exclusive
named views. The core has zero runtime dependencies.

[Open the live multi-tab demo](https://farooqalaulddin.github.io/tabula-js/).

## Install

```bash
npm install @farooqalaulddin/tabula-js
```

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

Tabs coordinate only when they use the same workspace namespace on the same origin.

## Product scope

Tabula deliberately owns seven browser-local coordination capabilities:

1. Workspace lifecycle with bounded usable readiness and observable repair.
2. Stable per-tab identity across refresh.
3. Typed, in-memory, deterministic last-write-wins state.
4. Eventual tab presence.
5. Web-Lock-authorized leader work with cleanup on voluntary transfer.
6. Web-Lock-authorized, token-fenced named views.
7. Deterministic Node.js test adapters through the `testing` export.

It is not a persistence layer, database, server lock, cross-device transport, window
manager, router, or collaborative document engine. It does not merge concurrent text,
rich documents, or drawing scenes. Use one claimed writer with read-only mirrors, or
use a CRDT/server-authoritative data layer for document collaboration.

## Why it exists

The browser already provides windows, focus, tiling, session restore, and multiple
monitors. Applications still need a coordination layer when an editor, preview,
settings view, or dashboard moves into another tab:

- shared UI hints must converge;
- logout and other same-device events must reach every tab;
- only one tab should own a WebSocket or polling responsibility;
- presence must be observable; and
- opening an exclusive view should focus or reject instead of creating two writers.

Tabula supplies that layer without introducing UI or framework ownership.

## Framework integration

Tabula v1 has no React wrapper. React, Vue, Svelte, and vanilla applications consume
the same core API at their integration boundary. The npm package documentation includes
an executable React `useSyncExternalStore` example built directly against the packed
core artifact.

## Important boundaries

- State is memory-only and disappears when the final tab closes.
- State uses deterministic last-write-wins operations, not field merging or a CRDT.
- Presence is an eventual liveness estimate under browser scheduling and suspension.
- Leadership and named-view exclusion are authoritative only while their Web Locks are held.
- Exactly-once external effects still require server-side idempotency or locking.
- `open()` must be called from a user gesture; focus remains browser policy.
- All participating scripts share one same-origin trust boundary.
- Never put credentials, tokens, raw PII, or server authorization decisions in shared state.

## Documentation

- [Canonical npm documentation and API reference](./packages/tabula/README.md)
- [Normative 1.0 behavioral contract](./docs/CONTRACT.md)
- [Browser behavior and tested support](./docs/BEHAVIOR.md)
- [Design decisions and non-goals](./DECISIONS.md)
- [Release procedure](./docs/RELEASING.md)
- [Live demo](https://farooqalaulddin.github.io/tabula-js/)
- [Exclusive Excalidraw example](./packages/example-excalidraw)

The package README is the canonical public API reference because npm renders that
file. Repository documents provide the normative protocol, lifecycle, support, and
release evidence behind it.

## Alternatives

Use the smallest primitive that fits the requirement:

| Alternative | Prefer it when |
|-------------|----------------|
| `BroadcastChannel` | You need a few messages and will own validation, synchronization, presence, and lifecycle. |
| Web Locks | You only need one tab to own a bounded responsibility. |
| `broadcast-channel` | You need fallback transports, older runtimes, or its channel/election API is sufficient. |
| SharedWorker | A centralized in-browser process and its lifecycle fit the application. |
| Server WebSocket fan-out | State must persist or cross origins, devices, users, or authorization boundaries. |
| Yjs or another CRDT | Multiple writers must merge document edits. |

Tabula can complement a server or CRDT by coordinating ephemeral UI surfaces on one
device; it does not replace either.

## Development

The repository uses the pnpm version pinned in `packageManager`.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:check
pnpm package:check
pnpm test:e2e
```

The documentation gate packs the package, installs it in an isolated consumer,
compiles every TypeScript/TSX example, executes ESM/CJS examples, runs browser and
React samples, compares documented exports with declarations, and validates relative
links.

## License

[MIT](./LICENSE)
