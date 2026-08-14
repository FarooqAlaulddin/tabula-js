// ════════════════════════════════════════════════════════════════════════════
// @farooqalaulddin/tabula-js/testing - utilities for Node.js and browser tests
// In-memory BroadcastChannel simulation. No browser APIs required.
// ════════════════════════════════════════════════════════════════════════════

import type {
	TabMeta,
	ViewClaimResult,
	ViewClaimToken,
	ViewHandle,
	ViewOpenOptions,
	Workspace,
	WorkspaceEventMap,
	WorkspaceState,
	WorkspaceStatus,
	WorkspaceTabs,
	WorkspaceViews,
} from '@tabula/tabula'
import { ViewAlreadyClaimedError } from '@tabula/tabula'

// ── In-memory channel ─────────────────────────────────────────────────────

type ChannelMessage = { type: string; from: string; to?: string; payload: unknown }
type ChannelListener = (msg: ChannelMessage) => void

class MemoryChannel {
	private listeners = new Map<string, Set<ChannelListener>>()

	subscribe(tabId: string, handler: ChannelListener): () => void {
		let set = this.listeners.get(tabId)
		if (!set) {
			set = new Set()
			this.listeners.set(tabId, set)
		}
		set.add(handler)
		return () => set.delete(handler)
	}

	broadcast(msg: ChannelMessage): void {
		for (const [tabId, handlers] of this.listeners) {
			if (tabId === msg.from) continue
			if (msg.to && msg.to !== tabId) continue
			for (const h of handlers) h(msg)
		}
	}

	removeTab(tabId: string): void {
		this.listeners.delete(tabId)
	}
}

// ── State Entry (internal) ────────────────────────────────────────────────

interface MockStateEntry {
	value: unknown
	ts: number
	tabId: string
}

// ── Mock Workspace ────────────────────────────────────────────────────────

class MockWorkspaceImpl<S extends object> implements Workspace<S> {
	readonly state: WorkspaceState<S>
	readonly views: WorkspaceViews
	readonly tabs: WorkspaceTabs

	readonly ready: Promise<void>
	private tabId: string
	private tabMeta: TabMeta
	private stateMap = new Map<string, MockStateEntry>()
	private stateListeners = new Map<string, Set<(value: unknown) => void>>()
	private wildcardListeners = new Set<(key: string, value: unknown) => void>()
	private eventListeners = new Map<string, Set<(payload: unknown) => void>>()
	private viewMap = new Map<string, TabMeta>()
	private viewTokenMap = new Map<string, ViewClaimToken>()
	private viewGenerations = new Map<string, number>()
	private currentView: string | null = null
	private leaderTabId: string | null = null
	private leaderSetups: Array<{
		setup: () => (() => void) | undefined
		cleanup: (() => void) | undefined
	}> = []
	private channel: MemoryChannel | null
	private allTabs: Map<string, MockWorkspaceImpl<S>> | null
	private unsub: (() => void) | null = null
	private destroyed = false

	constructor(
		tabId: string,
		channel: MemoryChannel | null = null,
		allTabs: Map<string, MockWorkspaceImpl<S>> | null = null,
	) {
		this.ready = Promise.resolve()
		this.tabId = tabId
		this.channel = channel
		this.allTabs = allTabs
		this.tabMeta = {
			id: tabId,
			view: null,
			visible: true,
			firstSeenAt: Date.now(),
			lastSeenAt: Date.now(),
		}

		// subscribe to channel if cluster mode
		if (channel) {
			this.unsub = channel.subscribe(tabId, (msg) => this.handleMessage(msg))
		}

		const self = this

		this.state = {
			set<K extends keyof S & string>(key: K, value: S[K]) {
				const entry: MockStateEntry = { value, ts: Date.now(), tabId: self.tabId }
				self.stateMap.set(key, entry)
				self.notifyState(key, value)
				self.channel?.broadcast({
					type: 'state:set',
					from: self.tabId,
					payload: { key, entry },
				})
			},
			get<K extends keyof S & string>(key: K): S[K] | undefined {
				const entry = self.stateMap.get(key)
				return entry?.value as S[K] | undefined
			},
			on(key: string, cb: (...args: unknown[]) => void) {
				if (key === '*') {
					const wrapped = cb as (key: string, value: unknown) => void
					self.wildcardListeners.add(wrapped)
					return () => self.wildcardListeners.delete(wrapped)
				}
				let set = self.stateListeners.get(key)
				if (!set) {
					set = new Set()
					self.stateListeners.set(key, set)
				}
				const wrapped = cb as (value: unknown) => void
				set.add(wrapped)
				return () => set.delete(wrapped)
			},
			delete<K extends keyof S & string>(key: K) {
				self.stateMap.delete(key)
				self.notifyState(key, undefined)
				self.channel?.broadcast({
					type: 'state:delete',
					from: self.tabId,
					payload: { key },
				})
			},
			keys() {
				return Array.from(self.stateMap.keys()) as any
			},
			entries() {
				return Array.from(self.stateMap.entries()).map(([k, e]) => [k, e.value]) as any
			},
			setAll(entries: Partial<S>) {
				for (const [key, value] of Object.entries(entries)) {
					this.set(key as any, value as any)
				}
			},
		} as WorkspaceState<S>

		this.views = {
			get: (name) => self.viewMap.get(name) ?? null,
			list: () => {
				const out: Record<string, TabMeta> = {}
				for (const [k, v] of self.viewMap) out[k] = v
				return out
			},
			has: (name) => self.viewMap.has(name),
		}

		this.tabs = {
			list: () => {
				if (self.allTabs) {
					return Array.from(self.allTabs.values()).map((t) => t.tabMeta)
				}
				return [self.tabMeta]
			},
			current: () => self.tabMeta,
			leader: () => {
				if (!self.leaderTabId) return null
				if (self.allTabs) {
					const leader = self.allTabs.get(self.leaderTabId)
					return leader?.tabMeta ?? null
				}
				return self.leaderTabId === self.tabId ? self.tabMeta : null
			},
		}

		// auto-elect self as leader if standalone
		if (!channel) {
			this.leaderTabId = tabId
		}
	}

	async claim(viewName: string): Promise<ViewClaimResult> {
		if (this.currentView) {
			if (this.currentView === viewName) {
				const token = this.viewTokenMap.get(viewName)
				if (token) {
					return { status: 'claimed', handle: this.createViewHandle(viewName, this.tabMeta, token) }
				}
			}
			throw new ViewAlreadyClaimedError(this.currentView)
		}
		const existing = this.viewMap.get(viewName)
		if (existing) {
			this.emit('view:conflict', {
				name: viewName,
				existing,
				incoming: this.tabMeta,
				token: this.viewTokenMap.get(viewName),
			})
			return { status: 'conflict', owner: existing }
		}
		const token = {
			generation: (this.viewGenerations.get(viewName) ?? 0) + 1,
			claimId: crypto.randomUUID(),
		}
		this.viewGenerations.set(viewName, token.generation)
		this.currentView = viewName
		this.tabMeta.view = viewName
		this.viewMap.set(viewName, this.tabMeta)
		this.viewTokenMap.set(viewName, token)
		this.emit('view:claimed', { name: viewName, tab: this.tabMeta, token })
		this.channel?.broadcast({
			type: 'view:claimed',
			from: this.tabId,
			payload: { name: viewName, tabId: this.tabId, token },
		})
		return { status: 'claimed', handle: this.createViewHandle(viewName, this.tabMeta, token) }
	}

	async open(viewName: string, _options: ViewOpenOptions<S>): Promise<ViewHandle> {
		const owner = this.viewMap.get(viewName) ?? this.tabMeta
		const token =
			this.viewTokenMap.get(viewName) ??
			({ generation: 1, claimId: crypto.randomUUID() } satisfies ViewClaimToken)
		return this.createViewHandle(viewName, owner, token)
	}

	focus(_viewName: string): void {
		// no-op in mock
	}

	destroy(): void {
		if (this.destroyed) return
		if (this.currentView) {
			const token = this.viewTokenMap.get(this.currentView)
			if (token) this.releaseView(this.currentView, token)
		}
		this.destroyed = true
		for (const entry of this.leaderSetups) {
			if (entry.cleanup) entry.cleanup()
		}
		this.leaderSetups = []
		this.unsub?.()
		this.channel?.removeTab(this.tabId)
		this.allTabs?.delete(this.tabId)
		this.eventListeners.clear()
		this.stateListeners.clear()
		this.wildcardListeners.clear()
	}

	status(): WorkspaceStatus {
		return Object.freeze({
			lifecycle: this.destroyed ? 'destroyed' : 'ready',
			sync: 'complete',
			missingPeerIds: Object.freeze([]),
		})
	}

	onLeader(setup: () => (() => void) | undefined): () => void {
		const entry = { setup, cleanup: undefined as (() => void) | undefined }
		this.leaderSetups.push(entry)
		if (this.leaderTabId === this.tabId) {
			entry.cleanup = setup() ?? undefined
		}
		return () => {
			if (entry.cleanup) entry.cleanup()
			const idx = this.leaderSetups.indexOf(entry)
			if (idx >= 0) this.leaderSetups.splice(idx, 1)
		}
	}

	isLeader(): boolean {
		return this.leaderTabId === this.tabId
	}

	on<E extends keyof WorkspaceEventMap>(
		event: E,
		cb: (payload: WorkspaceEventMap[E]) => void,
	): () => void {
		let set = this.eventListeners.get(event)
		if (!set) {
			set = new Set()
			this.eventListeners.set(event, set)
		}
		const wrapped = cb as (payload: unknown) => void
		set.add(wrapped)
		return () => set.delete(wrapped)
	}

	off<E extends keyof WorkspaceEventMap>(
		event: E,
		cb: (payload: WorkspaceEventMap[E]) => void,
	): void {
		const wrapped = cb as (payload: unknown) => void
		this.eventListeners.get(event)?.delete(wrapped)
	}

	// ── Internal (used by TestCluster) ──

	_emitTabJoin(tab: TabMeta): void {
		this.emit('tab:join', tab)
	}

	_setLeader(tabId: string): void {
		const wasLeader = this.leaderTabId === this.tabId
		this.leaderTabId = tabId
		const isNowLeader = tabId === this.tabId

		if (wasLeader && !isNowLeader) {
			for (const entry of this.leaderSetups) {
				if (entry.cleanup) {
					entry.cleanup()
					entry.cleanup = undefined
				}
			}
		} else if (!wasLeader && isNowLeader) {
			for (const entry of this.leaderSetups) {
				entry.cleanup = entry.setup() ?? undefined
			}
		}

		const leaderTab = this.allTabs?.get(tabId)
		if (leaderTab) {
			this.emit('leader:change', { tab: leaderTab.tabMeta, isMe: isNowLeader })
		}
	}

	private handleMessage(msg: ChannelMessage): void {
		if (msg.type === 'state:set') {
			const { key, entry } = msg.payload as { key: string; entry: MockStateEntry }
			const existing = this.stateMap.get(key)
			if (!existing || entry.ts >= existing.ts) {
				this.stateMap.set(key, entry)
				this.notifyState(key, entry.value)
			}
		} else if (msg.type === 'state:delete') {
			const { key } = msg.payload as { key: string }
			this.stateMap.delete(key)
			this.notifyState(key, undefined)
		} else if (msg.type === 'view:claimed') {
			const { name, tabId, token } = msg.payload as {
				name: string
				tabId: string
				token: ViewClaimToken
			}
			const tab = this.allTabs?.get(tabId)
			if (tab) {
				this.viewMap.set(name, tab.tabMeta)
				this.viewTokenMap.set(name, token)
				this.viewGenerations.set(name, token.generation)
				this.emit('view:claimed', { name, tab: tab.tabMeta, token })
			}
		} else if (msg.type === 'view:release') {
			const { name, token } = msg.payload as { name: string; token: ViewClaimToken }
			const current = this.viewTokenMap.get(name)
			if (!current || !this.tokensEqual(current, token)) return
			this.viewMap.delete(name)
			this.viewTokenMap.delete(name)
			this.emit('view:vacant', { name, token })
		}
	}

	private createViewHandle(viewName: string, owner: TabMeta, token: ViewClaimToken): ViewHandle {
		const on = (event: string, cb: (...args: any[]) => void): (() => void) =>
			this.on(event as keyof WorkspaceEventMap, (payload: any) => {
				if (payload.name !== viewName || !this.tokensEqual(payload.token, token)) return
				if (event === 'vacant') cb()
				else cb({ existing: payload.existing, incoming: payload.incoming })
			})
		return {
			name: viewName,
			token: { ...token },
			owner: { ...owner },
			on: on as ViewHandle['on'],
			release: () => {
				const holder = this.allTabs?.get(owner.id)
				if (holder) holder.releaseView(viewName, token)
				else this.releaseView(viewName, token)
			},
			focus: () => {},
		}
	}

	private releaseView(viewName: string, token: ViewClaimToken): void {
		const current = this.viewTokenMap.get(viewName)
		if (!current || !this.tokensEqual(current, token)) return
		this.viewMap.delete(viewName)
		this.viewTokenMap.delete(viewName)
		if (this.currentView === viewName) {
			this.currentView = null
			this.tabMeta.view = null
		}
		this.emit('view:vacant', { name: viewName, token })
		this.channel?.broadcast({
			type: 'view:release',
			from: this.tabId,
			payload: { name: viewName, token },
		})
	}

	private tokensEqual(left: ViewClaimToken, right: ViewClaimToken): boolean {
		return left.generation === right.generation && left.claimId === right.claimId
	}

	private notifyState(key: string, value: unknown): void {
		const listeners = this.stateListeners.get(key)
		if (listeners) {
			for (const cb of listeners) cb(value)
		}
		for (const cb of this.wildcardListeners) cb(key, value)
	}

	private emit(event: string, payload: unknown): void {
		const listeners = this.eventListeners.get(event)
		if (!listeners) return
		for (const cb of listeners) cb(payload)
	}
}

// ── Public API ────────────────────────────────────────────────────────────

export function createMockWorkspace<S extends object = Record<string, unknown>>(): Workspace<S> {
	const tabId = `mock-${Math.random().toString(36).slice(2, 10)}`
	return new MockWorkspaceImpl<S>(tabId)
}

export interface TestCluster<S extends object> {
	createTab(): Workspace<S>
}

export function createTestCluster<S extends object = Record<string, unknown>>(
	_namespace: string,
): TestCluster<S> {
	const channel = new MemoryChannel()
	const tabs = new Map<string, MockWorkspaceImpl<S>>()
	let tabCounter = 0

	function electLeader(): void {
		if (tabs.size === 0) return
		// Deterministic test simulation only; browsers use Web Lock request ordering.
		const sorted = Array.from(tabs.values()).sort(
			(a, b) => a.tabs.current().firstSeenAt - b.tabs.current().firstSeenAt,
		)
		const leaderId = sorted[0].tabs.current().id
		for (const tab of tabs.values()) {
			tab._setLeader(leaderId)
		}
	}

	return {
		createTab(): Workspace<S> {
			const tabId = `test-tab-${++tabCounter}`
			const mock = new MockWorkspaceImpl<S>(tabId, channel, tabs)
			tabs.set(tabId, mock)
			electLeader()

			// notify existing tabs
			for (const [id, existing] of tabs) {
				if (id !== tabId) {
					existing._emitTabJoin(mock.tabs.current())
				}
			}

			return mock
		},
	}
}
