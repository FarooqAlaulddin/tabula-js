import type {
	Message,
	MessageIdentity,
	MessageTarget,
	MessageType,
	TabMeta,
	ViewRegistryEntry,
} from '@tabula/tabula'
import { vi } from 'vitest'

// ── Mock BroadcastChannel ─────────────────────────────────────────────────

export class MockBroadcastChannel {
	name: string
	onmessage: ((ev: MessageEvent) => void) | null = null
	postMessage = vi.fn()
	close = vi.fn()

	constructor(name: string) {
		this.name = name
	}

	// simulate receiving a message from another tab
	simulateMessage(data: unknown): void {
		if (this.onmessage) {
			this.onmessage({ data } as MessageEvent)
		}
	}
}

export function installMockBroadcastChannel(): {
	instances: MockBroadcastChannel[]
	restore: () => void
} {
	const instances: MockBroadcastChannel[] = []
	const original = globalThis.BroadcastChannel
	;(globalThis as any).BroadcastChannel = class extends MockBroadcastChannel {
		constructor(name: string) {
			super(name)
			instances.push(this)
		}
	}

	return {
		instances,
		restore: () => {
			if (original) {
				;(globalThis as any).BroadcastChannel = original
			} else {
				delete (globalThis as any).BroadcastChannel
			}
		},
	}
}

// ── Mock localStorage / sessionStorage ────────────────────────────────────

export class MockStorage implements Storage {
	private store = new Map<string, string>()

	get length(): number {
		return this.store.size
	}

	clear(): void {
		this.store.clear()
	}

	getItem(key: string): string | null {
		return this.store.get(key) ?? null
	}

	key(index: number): string | null {
		const keys = Array.from(this.store.keys())
		return keys[index] ?? null
	}

	removeItem(key: string): void {
		this.store.delete(key)
	}

	setItem(key: string, value: string): void {
		this.store.set(key, value)
	}
}

export function installMockStorage(): { restore: () => void } {
	const mockLocal = new MockStorage()
	const mockSession = new MockStorage()
	const origLocal = globalThis.localStorage
	const origSession = globalThis.sessionStorage

	Object.defineProperty(globalThis, 'localStorage', { value: mockLocal, writable: true })
	Object.defineProperty(globalThis, 'sessionStorage', { value: mockSession, writable: true })

	return {
		restore: () => {
			Object.defineProperty(globalThis, 'localStorage', { value: origLocal, writable: true })
			Object.defineProperty(globalThis, 'sessionStorage', { value: origSession, writable: true })
		},
	}
}

// ── Mock document ─────────────────────────────────────────────────────────

export function installMockDocument(initialVisibility = 'visible'): {
	setVisibility: (state: string) => void
	getHandlers: (event: string) => Array<() => void>
	restore: () => void
} {
	let visibilityState = initialVisibility
	const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
	const origDocument = globalThis.document

	const mockDoc = {
		get visibilityState() {
			return visibilityState
		},
		addEventListener(event: string, handler: (...args: unknown[]) => void) {
			if (!handlers.has(event)) handlers.set(event, [])
			handlers.get(event)?.push(handler)
		},
		removeEventListener(event: string, handler: (...args: unknown[]) => void) {
			const list = handlers.get(event)
			if (list) {
				const idx = list.indexOf(handler)
				if (idx >= 0) list.splice(idx, 1)
			}
		},
	}

	Object.defineProperty(globalThis, 'document', { value: mockDoc, writable: true })

	return {
		setVisibility: (state: string) => {
			visibilityState = state
		},
		getHandlers: (event: string) => (handlers.get(event) as Array<() => void>) ?? [],
		restore: () => {
			Object.defineProperty(globalThis, 'document', { value: origDocument, writable: true })
		},
	}
}

// ── Mock window ───────────────────────────────────────────────────────────

interface QueuedLockRequest {
	name: string
	signal?: AbortSignal
	callback: (lock: Lock) => unknown
	resolve: (value: unknown) => void
	reject: (reason: unknown) => void
	granted: boolean
}

export class MockLockManager {
	private queues = new Map<string, QueuedLockRequest[]>()
	private held = new Set<string>()
	readonly requestedNames: string[] = []
	activeCount = 0
	maxActiveCount = 0

	request(name: string, options: LockOptions, callback: (lock: Lock) => unknown): Promise<unknown> {
		this.requestedNames.push(name)
		return new Promise((resolve, reject) => {
			const request: QueuedLockRequest = {
				name,
				signal: options.signal,
				callback,
				resolve,
				reject,
				granted: false,
			}
			if (request.signal?.aborted) {
				reject(new DOMException('The lock request was aborted.', 'AbortError'))
				return
			}
			const queue = this.queues.get(name) ?? []
			queue.push(request)
			this.queues.set(name, queue)
			request.signal?.addEventListener(
				'abort',
				() => {
					if (request.granted) return
					const index = queue.indexOf(request)
					if (index >= 0) queue.splice(index, 1)
					reject(new DOMException('The lock request was aborted.', 'AbortError'))
				},
				{ once: true },
			)
			this.pump(name)
		})
	}

	isHeld(name: string): boolean {
		return this.held.has(name)
	}

	queuedCount(name: string): number {
		return this.queues.get(name)?.length ?? 0
	}

	private pump(name: string): void {
		if (this.held.has(name)) return
		const queue = this.queues.get(name)
		const request = queue?.shift()
		if (!request) return
		if (request.signal?.aborted) {
			this.pump(name)
			return
		}
		request.granted = true
		this.held.add(name)
		this.activeCount++
		this.maxActiveCount = Math.max(this.maxActiveCount, this.activeCount)
		void Promise.resolve()
			.then(() => request.callback({ name, mode: 'exclusive' } as Lock))
			.then(request.resolve, request.reject)
			.finally(() => {
				this.activeCount--
				this.held.delete(name)
				this.pump(name)
			})
	}
}

export function installMockWindow(): {
	getHandlers: (event: string) => Array<(...args: unknown[]) => void>
	locks: MockLockManager
	restore: () => void
} {
	const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
	const origWindow = globalThis.window
	const secureContextDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext')
	const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

	const mockWin: Record<string, unknown> & {
		focus: ReturnType<typeof vi.fn>
		addEventListener: (event: string, handler: (...args: unknown[]) => void) => void
		removeEventListener: (event: string, handler: (...args: unknown[]) => void) => void
	} = {
		focus: vi.fn(),
		addEventListener(event: string, handler: (...args: unknown[]) => void) {
			if (!handlers.has(event)) handlers.set(event, [])
			handlers.get(event)?.push(handler)
		},
		removeEventListener(event: string, handler: (...args: unknown[]) => void) {
			const list = handlers.get(event)
			if (list) {
				const idx = list.indexOf(handler)
				if (idx >= 0) list.splice(idx, 1)
			}
		},
	}
	mockWin.self = mockWin
	mockWin.top = mockWin
	const locks = new MockLockManager()

	Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true })
	Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
	Object.defineProperty(globalThis, 'navigator', {
		value: { locks },
		configurable: true,
	})

	return {
		getHandlers: (event: string) => handlers.get(event) ?? [],
		locks,
		restore: () => {
			Object.defineProperty(globalThis, 'window', { value: origWindow, writable: true })
			if (secureContextDescriptor) {
				Object.defineProperty(globalThis, 'isSecureContext', secureContextDescriptor)
			} else {
				delete (globalThis as { isSecureContext?: boolean }).isSecureContext
			}
			if (navigatorDescriptor) {
				Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
			} else {
				delete (globalThis as { navigator?: Navigator }).navigator
			}
		},
	}
}

// ── Stub Channel (for Presence/State/Views tests) ─────────────────────────

export function createStubChannel(tabId = 'tab-1') {
	return {
		send: vi.fn(
			(type: MessageType, payload: unknown, to?: string | MessageTarget): Message => ({
				protocol: { major: 1, revision: 1, minRevision: 0 },
				type,
				from: { tabId, instanceId: `${tabId}-instance` },
				...(to ? { to: typeof to === 'string' ? { tabId: to } : to } : {}),
				payload,
				id: `${tabId}:${Math.random()}`,
				sentAt: Date.now(),
			}),
		),
		onMessage: vi.fn(() => () => {}),
		close: vi.fn(),
	}
}

// ── Stub Presence (for Leader/Views tests) ─────────────────────────────────

export function createStubPresence(
	tabId = 'tab-1',
	tabs: TabMeta[] = [],
): {
	tabId: string
	getAllTabs: () => TabMeta[]
	getTab: (id: string) => TabMeta | undefined
	getSelf: () => TabMeta
	isAlive: (id: string) => boolean
	setView: ReturnType<typeof vi.fn>
	broadcastLeave: ReturnType<typeof vi.fn>
	setTabs: (newTabs: TabMeta[]) => void
} {
	const self: TabMeta = {
		id: tabId,
		view: null,
		visible: true,
		firstSeenAt: Date.now(),
		lastSeenAt: Date.now(),
	}
	let allTabs = [self, ...tabs]

	return {
		tabId,
		getAllTabs: () => allTabs,
		getTab: (id: string) => allTabs.find((t) => t.id === id),
		getSelf: () => self,
		isAlive: (id: string) => allTabs.some((t) => t.id === id),
		setView: vi.fn((view: string | null) => {
			self.view = view
		}),
		broadcastLeave: vi.fn(),
		setTabs: (newTabs: TabMeta[]) => {
			allTabs = [self, ...newTabs]
		},
	}
}

// ── Stub Registry (for Views tests) ───────────────────────────────────────

export function createStubRegistry() {
	const store = new Map<string, ViewRegistryEntry>()
	const changeListeners = new Set<(view: string, entry: ViewRegistryEntry | null) => void>()

	return {
		get: (view: string) => store.get(view) ?? null,
		set: vi.fn((view: string, entry: ViewRegistryEntry) => store.set(view, entry)),
		delete: vi.fn((view: string) => store.delete(view)),
		list: () => Object.fromEntries(store),
		clearStale: vi.fn(() => []),
		startListening: vi.fn(),
		onChange: (listener: (view: string, entry: ViewRegistryEntry | null) => void) => {
			changeListeners.add(listener)
			return () => changeListeners.delete(listener)
		},
		stopListening: vi.fn(),
		// test helper
		simulateChange: (view: string, entry: ViewRegistryEntry | null) => {
			for (const l of changeListeners) l(view, entry)
		},
		_store: store,
	}
}

// ── Helper: create a TabMeta ──────────────────────────────────────────────

export function makeTab(overrides: Partial<TabMeta> = {}): TabMeta {
	return {
		id: `tab-${Math.random().toString(36).slice(2, 8)}`,
		view: null,
		visible: true,
		firstSeenAt: Date.now(),
		lastSeenAt: Date.now(),
		...overrides,
	}
}

// ── Helper: create a Message ──────────────────────────────────────────────

type MessageOverrides = Omit<Partial<Message>, 'from' | 'to'> & {
	from?: string | MessageIdentity
	to?: string | MessageTarget
}

export function makeMessage(overrides: MessageOverrides = {}): Message {
	const { from: fromOverride, to: toOverride, ...rest } = overrides
	const from = fromOverride ?? 'remote-tab'
	const to = toOverride
	return {
		protocol: { major: 1, revision: 1, minRevision: 0 },
		type: 'tab:announce',
		payload: { visible: true, view: null, createdAt: Date.now() },
		id: `msg-${Math.random().toString(36).slice(2, 8)}`,
		sentAt: Date.now(),
		...rest,
		from: typeof from === 'string' ? { tabId: from, instanceId: `${from}-instance` } : from,
		...(to ? { to: typeof to === 'string' ? { tabId: to } : to } : {}),
	}
}
