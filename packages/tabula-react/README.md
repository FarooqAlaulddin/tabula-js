# tabula-react

React bindings for [Tabula](https://github.com/user/tabula-js) — coordinate browser tabs as views of a single workspace.

[![npm version](https://img.shields.io/npm/v/tabula-react)](https://www.npmjs.com/package/tabula-react)

## Install

```bash
npm install tabula tabula-react
```

## Usage

Wrap your app (or just the component that needs cross-tab coordination) with `TabulaProvider`:

```tsx
import { createWorkspace } from 'tabula'
import { TabulaProvider, useSharedState } from 'tabula-react'

interface AppState {
  theme: 'light' | 'dark'
  draft: string
}

const workspace = createWorkspace<AppState>('my-app')

function App() {
  return (
    <TabulaProvider workspace={workspace}>
      <Editor />
    </TabulaProvider>
  )
}

function Editor() {
  const [draft, setDraft] = useSharedState<AppState, 'draft'>('draft')
  return <textarea value={draft ?? ''} onChange={e => setDraft(e.target.value)} />
}
```

## Hooks

### `useSharedState<S, K>(key)`

Subscribe to a shared state key. Returns `[value, setValue]` like `useState`, but syncs across tabs.

```tsx
const [theme, setTheme] = useSharedState<AppState, 'theme'>('theme')
```

### `useLeader()`

Returns `true` if this tab is the current leader.

```tsx
const isLeader = useLeader()
```

### `useTabPresence()`

Returns `TabMeta[]` for all connected tabs. Re-renders on join/leave.

```tsx
const tabs = useTabPresence()
```

### `useTabView()`

Returns the current tab's claimed view name, or `null`.

```tsx
const view = useTabView()
```

## Gradual adoption

Tabula doesn't require restructuring your app. Wrap just the components that need cross-tab state:

```tsx
// Your existing component — unchanged
function EditorPanel({ content, onChange }) {
  return <textarea value={content} onChange={e => onChange(e.target.value)} />
}

// Tabula wrapper — the only new code
function SyncedEditor() {
  const [content, setContent] = useSharedState<AppState, 'draft'>('draft')
  return <EditorPanel content={content ?? ''} onChange={setContent} />
}
```

## Requirements

- React 18 or 19
- `tabula` (peer dependency)

## License

[MIT](../../LICENSE)
