import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	useSyncExternalStore,
} from 'react'
import type { TabMeta, Workspace, WorkspaceEventMap } from 'tabula'

// ── Context ───────────────────────────────────────────────────────────────

const TabulaContext = createContext<Workspace | null>(null)

function useWorkspace(): Workspace {
	const ws = useContext(TabulaContext)
	if (!ws) {
		throw new Error(
			'useWorkspace() was called outside of a <TabulaProvider>. ' +
				'Wrap your component tree with <TabulaProvider workspace={...}>.',
		)
	}
	return ws
}

// ── Provider ──────────────────────────────────────────────────────────────

export interface TabulaProviderProps {
	workspace: Workspace
	children: ReactNode
}

export function TabulaProvider({ workspace, children }: TabulaProviderProps): ReactNode {
	return TabulaContext.Provider({ value: workspace, children })
}

// ── Hooks ─────────────────────────────────────────────────────────────────

export function useSharedState<S extends object, K extends keyof S & string>(
	key: K,
): [S[K] | undefined, (value: S[K]) => void] {
	const ws = useWorkspace() as Workspace<S>

	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			return ws.state.on(key, onStoreChange)
		},
		[ws, key],
	)

	const getSnapshot = useCallback(() => {
		return ws.state.get(key)
	}, [ws, key])

	const value = useSyncExternalStore(subscribe, getSnapshot)

	const setValue = useCallback(
		(v: S[K]) => {
			ws.state.set(key, v)
		},
		[ws, key],
	)

	return [value, setValue]
}

export function useLeader(): boolean {
	const ws = useWorkspace()
	const [isLeader, setIsLeader] = useState(() => ws.isLeader())

	useEffect(() => {
		const unsub = ws.on('leader:change', (e: WorkspaceEventMap['leader:change']) => {
			setIsLeader(e.isMe)
		})
		// sync in case it changed between render and effect
		setIsLeader(ws.isLeader())
		return unsub
	}, [ws])

	return isLeader
}

export function useTabPresence(): TabMeta[] {
	const ws = useWorkspace()
	const [tabs, setTabs] = useState(() => ws.tabs.list())

	useEffect(() => {
		const refresh = () => setTabs(ws.tabs.list())
		const unsub1 = ws.on('tab:join', refresh)
		const unsub2 = ws.on('tab:leave', refresh)
		refresh()
		return () => {
			unsub1()
			unsub2()
		}
	}, [ws])

	return tabs
}

export function useTabView(): string | null {
	const ws = useWorkspace()
	const [view, setView] = useState(() => ws.tabs.current().view)

	useEffect(() => {
		const refresh = () => setView(ws.tabs.current().view)
		const unsub1 = ws.on('view:claimed', refresh)
		const unsub2 = ws.on('view:vacant', refresh)
		refresh()
		return () => {
			unsub1()
			unsub2()
		}
	}, [ws])

	return view
}
