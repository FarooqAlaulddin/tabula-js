// ════════════════════════════════════════════════════════════════════════════
// Tabula — Coordinate browser tabs as views of a single workspace
// Single-file core. Zero dependencies. ~6kb gzipped target.
// ════════════════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────────────

export type MessageType =
	| 'tab:announce'
	| 'tab:heartbeat'
	| 'tab:leave'
	| 'state:sync-request'
	| 'state:sync'
	| 'state:set'
	| 'state:delete'
	| 'view:claim'
	| 'view:claimed'
	| 'view:release'
	| 'view:conflict'
	| 'view:focus'
	| 'leader:change'

export interface Message<T = unknown> {
	type: MessageType
	from: string
	to?: string
	payload: T
	id: string
	ts: number
}

export interface TabMeta {
	id: string
	view: string | null
	visible: boolean
	firstSeenAt: number
	lastSeenAt: number
}

export interface StateEntry<V = unknown> {
	value: V
	ts: number
	tabId: string
	version: number
}

export interface ViewRegistryEntry {
	tabId: string
	claimedAt: number
	epoch: string
	meta: Record<string, unknown>
}

export interface WorkspaceOptions {
	heartbeat?: number
	timeout?: number
	session?: boolean
}

export interface ViewOpenOptions<S> {
	url: string
	syncKeys?: (keyof S & string)[]
}

export interface ViewClaimedEvent {
	name: string
	tab: TabMeta
}

export interface ViewVacantEvent {
	name: string
}

export interface ViewConflictEvent {
	name: string
	existing: TabMeta
	incoming: TabMeta
}

export interface LeaderChangeEvent {
	tab: TabMeta
	isMe: boolean
}

export interface WorkspaceEventMap {
	'view:claimed': ViewClaimedEvent
	'view:vacant': ViewVacantEvent
	'view:conflict': ViewConflictEvent
	'tab:join': TabMeta
	'tab:leave': TabMeta
	'leader:change': LeaderChangeEvent
}

export interface ViewHandle {
	on(event: 'vacant', cb: () => void): () => void
	on(event: 'conflict', cb: (e: { existing: TabMeta; incoming: TabMeta }) => void): () => void
	release(): void
	focus(): void
}

export interface Workspace<S extends object = Record<string, unknown>> {
	readonly state: WorkspaceState<S>
	readonly views: WorkspaceViews
	readonly tabs: WorkspaceTabs
	/** Resolves when the workspace has completed init (presence discovery, state sync, leader election). */
	readonly ready: Promise<void>
	claim(viewName: string): void
	open(viewName: string, options: ViewOpenOptions<S>): Promise<ViewHandle>
	focus(viewName: string): void
	destroy(): void
	onLeader(setup: () => (() => void) | undefined): () => void
	isLeader(): boolean
	on<E extends keyof WorkspaceEventMap>(
		event: E,
		cb: (payload: WorkspaceEventMap[E]) => void,
	): () => void
	off<E extends keyof WorkspaceEventMap>(
		event: E,
		cb: (payload: WorkspaceEventMap[E]) => void,
	): void
}

export interface WorkspaceState<S extends object> {
	set<K extends keyof S & string>(key: K, value: S[K]): void
	get<K extends keyof S & string>(key: K): S[K] | undefined
	on<K extends keyof S & string>(key: K, cb: (value: S[K]) => void): () => void
	on(key: '*', cb: (key: string, value: unknown) => void): () => void
	delete<K extends keyof S & string>(key: K): void
}

export interface WorkspaceViews {
	get(viewName: string): TabMeta | null
	list(): Record<string, TabMeta>
	has(viewName: string): boolean
}

export interface WorkspaceTabs {
	list(): TabMeta[]
	current(): TabMeta
	leader(): TabMeta | null
}

// ── Layer 1: Transport ────────────────────────────────────────────────────

/** @internal */ export function getTabId(): string {
	if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
		throw new Error(
			'Tabula requires crypto.randomUUID(). Supported in Chrome 92+, Firefox 95+, Safari 15.4+.',
		)
	}

	// If this page was opened via window.open(), it inherits the opener's sessionStorage.
	// We must generate a fresh ID to avoid sharing the same tabId (which breaks
	// BroadcastChannel self-message filtering). Clear the inherited ID first.
	if (window.opener) {
		sessionStorage.removeItem('tabula:tab-id')
	}

	const existing = sessionStorage.getItem('tabula:tab-id')
	if (existing) return existing

	const id = crypto.randomUUID()
	sessionStorage.setItem('tabula:tab-id', id)
	return id
}

/** @internal */ export function getSessionEpoch(): string {
	const existing = sessionStorage.getItem('tabula:epoch')
	if (existing) return existing
	const epoch = Date.now().toString()
	sessionStorage.setItem('tabula:epoch', epoch)
	return epoch
}

let msgCounter = 0
const msgNonce = Math.random().toString(36).slice(2, 8)

/** @internal — exported for testing only */
export class Dedup {
	private seen = new Set<string>()
	private order: string[] = []

	isDuplicate(id: string): boolean {
		if (this.seen.has(id)) return true
		this.seen.add(id)
		this.order.push(id)
		if (this.order.length > 500) {
			const evict = this.order.shift()
			if (evict) this.seen.delete(evict)
		}
		return false
	}
}

type MsgHandler = (msg: Message) => void

/** @internal */ export class Channel {
	private bc: BroadcastChannel
	private handlers = new Set<MsgHandler>()
	private dedup = new Dedup()
	private tabId: string
	private closed = false

	constructor(namespace: string, tabId: string) {
		if (typeof BroadcastChannel === 'undefined') {
			throw new Error(
				'Tabula requires BroadcastChannel. Supported in all modern browsers. ' +
					'For Node.js testing, use tabula/testing.',
			)
		}
		this.bc = new BroadcastChannel(`tabula:${namespace}`)
		this.tabId = tabId
		this.bc.onmessage = (e: MessageEvent) => {
			const msg = e.data as Message
			if (!msg?.type || !msg.id) return
			if (msg.from === this.tabId) return
			if (msg.to && msg.to !== this.tabId) return
			if (this.dedup.isDuplicate(msg.id)) return
			for (const h of this.handlers) h(msg)
		}
	}

	send<T>(type: MessageType, payload: T, to?: string): Message<T> {
		const msg: Message<T> = {
			type,
			from: this.tabId,
			to,
			payload,
			id: `${this.tabId}:${msgNonce}:${++msgCounter}`,
			ts: Date.now(),
		}
		if (!this.closed) this.bc.postMessage(msg)
		return msg
	}

	onMessage(handler: MsgHandler): () => void {
		this.handlers.add(handler)
		return () => this.handlers.delete(handler)
	}

	close(): void {
		this.closed = true
		this.handlers.clear()
		this.bc.close()
	}
}

/** @internal */ export class Registry {
	private prefix: string
	private handler: ((e: StorageEvent) => void) | null = null
	private listeners = new Set<(view: string, entry: ViewRegistryEntry | null) => void>()

	constructor(namespace: string) {
		this.prefix = `tabula:${namespace}:view:`
	}

	get(view: string): ViewRegistryEntry | null {
		const raw = localStorage.getItem(this.prefix + view)
		if (!raw) return null
		try {
			return JSON.parse(raw) as ViewRegistryEntry
		} catch {
			return null
		}
	}

	set(view: string, entry: ViewRegistryEntry): void {
		localStorage.setItem(this.prefix + view, JSON.stringify(entry))
	}

	delete(view: string): void {
		localStorage.removeItem(this.prefix + view)
	}

	list(): Record<string, ViewRegistryEntry> {
		const out: Record<string, ViewRegistryEntry> = {}
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)
			if (!key?.startsWith(this.prefix)) continue
			const entry = this.get(key.slice(this.prefix.length))
			if (entry) out[key.slice(this.prefix.length)] = entry
		}
		return out
	}

	clearStale(epoch: string): string[] {
		const cleared: string[] = []
		for (const [view, entry] of Object.entries(this.list())) {
			if (entry.epoch !== epoch) {
				this.delete(view)
				cleared.push(view)
			}
		}
		return cleared
	}

	startListening(): void {
		if (this.handler) return
		this.handler = (e: StorageEvent) => {
			if (!e.key?.startsWith(this.prefix)) return
			const view = e.key.slice(this.prefix.length)
			let entry: ViewRegistryEntry | null = null
			if (e.newValue) {
				try {
					entry = JSON.parse(e.newValue) as ViewRegistryEntry
				} catch {
					/* ignore */
				}
			}
			for (const l of this.listeners) l(view, entry)
		}
		window.addEventListener('storage', this.handler)
	}

	onChange(listener: (view: string, entry: ViewRegistryEntry | null) => void): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	stopListening(): void {
		if (this.handler) {
			window.removeEventListener('storage', this.handler)
			this.handler = null
		}
		this.listeners.clear()
	}
}

// ── Layer 2: Presence ─────────────────────────────────────────────────────

interface AnnouncePayload {
	visible: boolean
	view: string | null
	createdAt: number // tab's actual creation time, used for leader election
}

/** @internal */ export class Presence {
	readonly tabId: string
	private tabMap = new Map<string, TabMeta>()
	private channel: Channel
	private heartbeatMs: number
	private timeoutMs: number
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null
	private pruneTimer: ReturnType<typeof setInterval> | null = null
	private onJoin: (tab: TabMeta) => void
	private onLeave: (tab: TabMeta) => void
	private currentView: string | null = null
	private visibilityHandler: (() => void) | null = null
	private createdAt: number

	constructor(
		channel: Channel,
		tabId: string,
		heartbeatMs: number,
		timeoutMs: number,
		onJoin: (tab: TabMeta) => void,
		onLeave: (tab: TabMeta) => void,
	) {
		this.channel = channel
		this.tabId = tabId
		this.heartbeatMs = heartbeatMs
		this.timeoutMs = timeoutMs
		this.onJoin = onJoin
		this.onLeave = onLeave
		this.createdAt = Date.now()

		// register self
		this.tabMap.set(tabId, {
			id: tabId,
			view: null,
			visible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
			firstSeenAt: this.createdAt,
			lastSeenAt: this.createdAt,
		})
	}

	start(): void {
		// announce to others
		this.announce()

		// heartbeat
		this.heartbeatTimer = setInterval(() => {
			this.channel.send<null>('tab:heartbeat', null)
			this.updateSelf()
		}, this.heartbeatMs)

		// prune dead tabs
		this.pruneTimer = setInterval(() => this.prune(), this.heartbeatMs)

		// visibility tracking
		if (typeof document !== 'undefined') {
			this.visibilityHandler = () => {
				this.updateSelf()
				if (document.visibilityState === 'visible') {
					// wake-up: re-announce to update presence in other tabs
					this.announce()
				}
			}
			document.addEventListener('visibilitychange', this.visibilityHandler)
		}
	}

	announce(): void {
		const payload: AnnouncePayload = {
			visible: this.getSelf().visible,
			view: this.currentView,
			createdAt: this.createdAt,
		}
		this.channel.send('tab:announce', payload)
	}

	/** Re-add a tab that was pruned but is still sending messages. */
	private resurrect(tabId: string): void {
		const tab: TabMeta = {
			id: tabId,
			view: null,
			visible: false, // assume hidden (that's why it was pruned)
			firstSeenAt: Date.now(),
			lastSeenAt: Date.now(),
		}
		this.tabMap.set(tabId, tab)
		this.onJoin(tab)
		// ask it to announce so we get its real metadata
		this.announce()
	}

	handleMessage(msg: Message): void {
		// Any message from an unknown tab (except tab:leave) means it's alive
		// but was pruned due to browser throttling. Re-add it.
		if (msg.type !== 'tab:leave' && msg.type !== 'tab:announce' && msg.type !== 'tab:heartbeat') {
			if (!this.tabMap.has(msg.from)) {
				this.resurrect(msg.from)
			}
		}

		if (msg.type === 'tab:announce') {
			const payload = msg.payload as AnnouncePayload
			const existing = this.tabMap.get(msg.from)
			const tab: TabMeta = {
				id: msg.from,
				view: payload.view,
				visible: payload.visible,
				// Use the sender's actual creation time so all tabs agree on ordering
				firstSeenAt: existing?.firstSeenAt ?? payload.createdAt ?? Date.now(),
				lastSeenAt: Date.now(),
			}
			this.tabMap.set(msg.from, tab)
			if (!existing) this.onJoin(tab)
			// respond with our own announce so they know about us
			if (!existing) this.announce()
		} else if (msg.type === 'tab:heartbeat') {
			const existing = this.tabMap.get(msg.from)
			if (existing) {
				existing.lastSeenAt = Date.now()
			} else {
				// Tab was pruned but is still alive (browser throttled its heartbeats).
				// Re-add it — a dead tab can't send heartbeats.
				this.resurrect(msg.from)
			}
		} else if (msg.type === 'tab:leave') {
			const tab = this.tabMap.get(msg.from)
			if (tab) {
				this.tabMap.delete(msg.from)
				this.onLeave(tab)
			}
		}
	}

	setView(view: string | null): void {
		this.currentView = view
		const self = this.tabMap.get(this.tabId)
		if (self) self.view = view
	}

	getSelf(): TabMeta {
		return this.tabMap.get(this.tabId) as TabMeta
	}

	getTab(id: string): TabMeta | undefined {
		return this.tabMap.get(id)
	}

	getAllTabs(): TabMeta[] {
		return Array.from(this.tabMap.values())
	}

	isAlive(tabId: string): boolean {
		return this.tabMap.has(tabId)
	}

	broadcastLeave(): void {
		this.channel.send<null>('tab:leave', null)
	}

	stop(): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
		if (this.pruneTimer) clearInterval(this.pruneTimer)
		if (this.visibilityHandler && typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.visibilityHandler)
		}
		this.heartbeatTimer = null
		this.pruneTimer = null
		this.visibilityHandler = null
	}

	private updateSelf(): void {
		const self = this.tabMap.get(this.tabId)
		if (self) {
			self.visible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
			self.lastSeenAt = Date.now()
		}
	}

	private prune(): void {
		const now = Date.now()
		for (const [id, tab] of this.tabMap) {
			if (id === this.tabId) continue
			// Browsers aggressively throttle background tab timers (Chrome: up to 1/minute
			// after 5 min). Hidden tabs need a much longer grace period to avoid false pruning.
			// Visible: standard timeout. Hidden: 90s minimum (survives 1/minute throttling).
			const hiddenGrace = Math.max(this.timeoutMs * 4, 90_000)
			const effectiveTimeout = tab.visible ? this.timeoutMs : hiddenGrace
			if (now - tab.lastSeenAt > effectiveTimeout) {
				this.tabMap.delete(id)
				this.onLeave(tab)
			}
		}
	}
}

// ── Layer 2: Leader ───────────────────────────────────────────────────────

/** @internal */ export class Leader {
	private presence: Presence
	private currentLeaderId: string | null = null
	private onChange: (leaderId: string) => void

	constructor(presence: Presence, onChange: (leaderId: string) => void) {
		this.presence = presence
		this.onChange = onChange
	}

	recalculate(): void {
		const tabs = this.presence.getAllTabs()
		const visibleTabs = tabs.filter((t) => t.visible)
		// prefer visible tabs; if none visible, use all
		const candidates = visibleTabs.length > 0 ? visibleTabs : tabs
		// sort by firstSeenAt (locally observed), then tabId lexicographic
		candidates.sort((a, b) => a.firstSeenAt - b.firstSeenAt || a.id.localeCompare(b.id))
		const newLeader = candidates[0]
		if (newLeader && newLeader.id !== this.currentLeaderId) {
			this.currentLeaderId = newLeader.id
			this.onChange(newLeader.id)
		}
	}

	getLeaderId(): string | null {
		return this.currentLeaderId
	}

	isLeader(): boolean {
		return this.currentLeaderId === this.presence.tabId
	}
}

// ── Layer 2: State ────────────────────────────────────────────────────────

/** @internal */ export class State<S extends object> {
	private entries = new Map<string, StateEntry>()
	private versions = new Map<string, number>()
	private keyListeners = new Map<string, Set<(value: unknown) => void>>()
	private wildcardListeners = new Set<(key: string, value: unknown) => void>()
	private channel: Channel
	private tabId: string

	constructor(channel: Channel, tabId: string) {
		this.channel = channel
		this.tabId = tabId
	}

	set<K extends keyof S & string>(key: K, value: S[K]): void {
		const version = (this.versions.get(key) ?? 0) + 1
		this.versions.set(key, version)
		const entry: StateEntry = { value, ts: Date.now(), tabId: this.tabId, version }
		this.entries.set(key, entry)
		this.channel.send('state:set', { key, entry })
		this.notify(key, value)
	}

	get<K extends keyof S & string>(key: K): S[K] | undefined {
		const entry = this.entries.get(key)
		return entry?.value as S[K] | undefined
	}

	delete<K extends keyof S & string>(key: K): void {
		this.entries.delete(key)
		this.channel.send('state:delete', { key })
		this.notify(key, undefined)
	}

	onKey<K extends keyof S & string>(key: K, cb: (value: S[K]) => void): () => void {
		let set = this.keyListeners.get(key)
		if (!set) {
			set = new Set()
			this.keyListeners.set(key, set)
		}
		const wrapped = cb as (value: unknown) => void
		set.add(wrapped)
		return () => set.delete(wrapped)
	}

	onWildcard(cb: (key: string, value: unknown) => void): () => void {
		this.wildcardListeners.add(cb)
		return () => this.wildcardListeners.delete(cb)
	}

	handleMessage(msg: Message): void {
		if (msg.type === 'state:set') {
			const { key, entry } = msg.payload as { key: string; entry: StateEntry }
			if (this.shouldAccept(key, entry)) {
				this.entries.set(key, entry)
				this.notify(key, entry.value)
			}
		} else if (msg.type === 'state:delete') {
			const { key } = msg.payload as { key: string }
			this.entries.delete(key)
			this.notify(key, undefined)
		} else if (msg.type === 'state:sync-request') {
			// respond with our full state
			const snapshot: Record<string, StateEntry> = {}
			for (const [k, v] of this.entries) snapshot[k] = v
			this.channel.send('state:sync', { state: snapshot }, msg.from)
		} else if (msg.type === 'state:sync') {
			const { state: snapshot } = msg.payload as { state: Record<string, StateEntry> }
			for (const [key, entry] of Object.entries(snapshot)) {
				if (this.shouldAccept(key, entry)) {
					this.entries.set(key, entry)
					this.notify(key, entry.value)
				}
			}
		}
	}

	requestSync(): void {
		this.channel.send<null>('state:sync-request', null)
	}

	getSnapshot(): Record<string, StateEntry> {
		const out: Record<string, StateEntry> = {}
		for (const [k, v] of this.entries) out[k] = v
		return out
	}

	getKeysForSync(keys: string[]): Record<string, unknown> {
		const out: Record<string, unknown> = {}
		for (const key of keys) {
			const entry = this.entries.get(key)
			if (entry) out[key] = entry.value
		}
		return out
	}

	private shouldAccept(key: string, incoming: StateEntry): boolean {
		const existing = this.entries.get(key)
		if (!existing) return true
		if (incoming.ts > existing.ts) return true
		if (incoming.ts < existing.ts) return false
		// same timestamp: use tabId tiebreak, then version for same-tab rapid writes
		if (incoming.tabId !== existing.tabId) return incoming.tabId > existing.tabId
		return incoming.version > existing.version
	}

	private notify(key: string, value: unknown): void {
		const listeners = this.keyListeners.get(key)
		if (listeners) {
			for (const cb of listeners) cb(value)
		}
		for (const cb of this.wildcardListeners) cb(key, value)
	}
}

// ── Layer 2: Views ────────────────────────────────────────────────────────

/** @internal */ export class Views {
	private registry: Registry
	private channel: Channel
	private presence: Presence
	private epoch: string
	private inMemory = new Map<string, TabMeta>()
	private onClaimed: (name: string, tab: TabMeta) => void
	private onVacant: (name: string) => void
	private onConflict: (name: string, existing: TabMeta, incoming: TabMeta) => void
	private visibilityHandler: (() => void) | null = null

	constructor(
		registry: Registry,
		channel: Channel,
		presence: Presence,
		epoch: string,
		onClaimed: (name: string, tab: TabMeta) => void,
		onVacant: (name: string) => void,
		onConflict: (name: string, existing: TabMeta, incoming: TabMeta) => void,
	) {
		this.registry = registry
		this.channel = channel
		this.presence = presence
		this.epoch = epoch
		this.onClaimed = onClaimed
		this.onVacant = onVacant
		this.onConflict = onConflict
	}

	start(): void {
		// listen for storage events as secondary sync
		this.registry.onChange((viewName, entry) => {
			if (!entry) {
				// deleted externally
				if (this.inMemory.has(viewName)) {
					this.inMemory.delete(viewName)
					this.onVacant(viewName)
				}
			} else {
				const tab = this.presence.getTab(entry.tabId)
				if (tab) {
					this.inMemory.set(viewName, tab)
				}
			}
		})

		// wake-up reconciliation
		if (typeof document !== 'undefined') {
			this.visibilityHandler = () => {
				if (document.visibilityState === 'visible') {
					this.reconcile()
				}
			}
			document.addEventListener('visibilitychange', this.visibilityHandler)
		}
	}

	loadFromRegistry(): void {
		const entries = this.registry.list()
		for (const [viewName, entry] of Object.entries(entries)) {
			const tab = this.presence.getTab(entry.tabId)
			if (tab) {
				this.inMemory.set(viewName, tab)
			}
		}
	}

	validateAgainstPresence(): void {
		for (const [viewName, tab] of this.inMemory) {
			if (!this.presence.isAlive(tab.id)) {
				this.inMemory.delete(viewName)
				this.registry.delete(viewName)
				this.onVacant(viewName)
			}
		}
	}

	claim(viewName: string): boolean {
		const existing = this.registry.get(viewName)

		if (existing && this.presence.isAlive(existing.tabId)) {
			// conflict — someone else holds it
			const existingTab = this.presence.getTab(existing.tabId)
			const incomingTab = this.presence.getSelf()
			if (existingTab) {
				this.onConflict(viewName, existingTab, incomingTab)
			}
			return false
		}

		// claim it
		this.registry.set(viewName, {
			tabId: this.presence.tabId,
			claimedAt: Date.now(),
			epoch: this.epoch,
			meta: {},
		})

		const self = this.presence.getSelf()
		this.inMemory.set(viewName, self)
		this.presence.setView(viewName)
		this.channel.send('view:claimed', { name: viewName, tabId: this.presence.tabId })
		this.onClaimed(viewName, self)
		return true
	}

	release(viewName: string): void {
		this.registry.delete(viewName)
		this.inMemory.delete(viewName)
		if (this.presence.getSelf().view === viewName) {
			this.presence.setView(null)
		}
		this.channel.send('view:release', { name: viewName })
		this.onVacant(viewName)
	}

	handleMessage(msg: Message): void {
		if (msg.type === 'view:claimed') {
			const { name, tabId } = msg.payload as { name: string; tabId: string }
			const tab = this.presence.getTab(tabId) ?? {
				id: tabId,
				view: name,
				visible: true,
				firstSeenAt: Date.now(),
				lastSeenAt: Date.now(),
			}
			this.inMemory.set(name, tab)
			this.onClaimed(name, tab)
		} else if (msg.type === 'view:release') {
			const { name } = msg.payload as { name: string }
			this.inMemory.delete(name)
			this.onVacant(name)
		} else if (msg.type === 'view:focus') {
			const { name } = msg.payload as { name: string }
			// if we hold this view, bring ourselves to front
			if (this.presence.getSelf().view === name) {
				window.focus()
			}
		}
	}

	get(viewName: string): TabMeta | null {
		return this.inMemory.get(viewName) ?? null
	}

	listAll(): Record<string, TabMeta> {
		const out: Record<string, TabMeta> = {}
		for (const [k, v] of this.inMemory) out[k] = v
		return out
	}

	has(viewName: string): boolean {
		return this.inMemory.has(viewName)
	}

	focus(viewName: string): void {
		this.channel.send('view:focus', { name: viewName })
	}

	cleanupForTab(tabId: string): void {
		for (const [viewName, tab] of this.inMemory) {
			if (tab.id === tabId) {
				this.inMemory.delete(viewName)
				this.registry.delete(viewName)
				this.onVacant(viewName)
			}
		}
	}

	stop(): void {
		if (this.visibilityHandler && typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.visibilityHandler)
		}
	}

	private reconcile(): void {
		// re-read localStorage and compare against in-memory
		const entries = this.registry.list()

		// check if our views were reassigned
		const self = this.presence.getSelf()
		if (self.view) {
			const regEntry = entries[self.view]
			if (regEntry && regEntry.tabId !== self.id) {
				// our view was taken while we were sleeping — yield
				this.inMemory.delete(self.view)
				this.presence.setView(null)
				this.onVacant(self.view)
			}
		}

		// update in-memory from registry
		for (const [viewName, entry] of Object.entries(entries)) {
			const tab = this.presence.getTab(entry.tabId)
			if (tab) {
				this.inMemory.set(viewName, tab)
			} else if (!this.presence.isAlive(entry.tabId)) {
				this.registry.delete(viewName)
				this.inMemory.delete(viewName)
				this.onVacant(viewName)
			}
		}
	}
}

// ── Layer 3: Coordinator ──────────────────────────────────────────────────

interface QueuedCall {
	fn: () => void
}

class Coordinator<S extends object> {
	private channel: Channel
	private registry: Registry
	private presence: Presence
	private leader: Leader
	private state: State<S>
	private views: Views

	private tabId: string
	private epoch: string
	private options: Required<WorkspaceOptions>
	private ready = false
	private queue: QueuedCall[] = []
	private readyResolve!: () => void
	readonly readyPromise: Promise<void>

	// event system
	private eventListeners = new Map<string, Set<(payload: unknown) => void>>()

	// leader callbacks
	private leaderSetups: Array<{
		setup: () => (() => void) | undefined
		cleanup: (() => void) | undefined
	}> = []

	// pagehide handler
	private pagehideHandler: (() => void) | null = null

	constructor(namespace: string, opts: WorkspaceOptions) {
		this.readyPromise = new Promise<void>((resolve) => {
			this.readyResolve = resolve
		})
		this.options = {
			heartbeat: opts.heartbeat ?? 1500,
			timeout: opts.timeout ?? 5000,
			session: opts.session ?? true,
		}

		// Step 1: tab identity
		this.tabId = getTabId()
		this.epoch = getSessionEpoch()

		// Step 2: transport
		this.channel = new Channel(namespace, this.tabId)
		this.registry = new Registry(namespace)

		// Step 3: clear stale entries
		if (this.options.session) {
			this.registry.clearStale(this.epoch)
		}

		// Step 4: domain modules
		this.presence = new Presence(
			this.channel,
			this.tabId,
			this.options.heartbeat,
			this.options.timeout,
			(tab) => {
				this.emit('tab:join', tab)
				this.leader.recalculate()
			},
			(tab) => {
				this.emit('tab:leave', tab)
				this.views.cleanupForTab(tab.id)
				this.leader.recalculate()
			},
		)

		this.leader = new Leader(this.presence, (leaderId) => {
			const tab = this.presence.getTab(leaderId)
			if (!tab) return
			this.emit('leader:change', { tab, isMe: leaderId === this.tabId })
			this.runLeaderCallbacks()
		})

		this.state = new State<S>(this.channel, this.tabId)

		this.views = new Views(
			this.registry,
			this.channel,
			this.presence,
			this.epoch,
			(name, tab) => this.emit('view:claimed', { name, tab }),
			(name) => this.emit('view:vacant', { name }),
			(name, existing, incoming) => this.emit('view:conflict', { name, existing, incoming }),
		)

		// message routing
		this.channel.onMessage((msg) => {
			this.presence.handleMessage(msg)
			this.state.handleMessage(msg)
			this.views.handleMessage(msg)
		})

		// start localStorage listener
		this.registry.startListening()

		// startup
		this.init()
	}

	private async init(): Promise<void> {
		// Step 5: start presence (broadcasts announce)
		this.presence.start()

		// Step 6: wait for announce responses
		// If we know tabs from the view registry, wait for them specifically.
		// Otherwise, wait briefly for any announce (resolves on first join or timeout).
		const knownFromRegistry = Object.values(this.registry.list())
		const expectedTabs = new Set(knownFromRegistry.map((e) => e.tabId))
		await this.waitForTabs(expectedTabs, expectedTabs.size > 0 ? 150 : 100)

		// Step 7: leader calculation
		this.leader.recalculate()

		// Step 8: state sync
		await this.syncState()

		// Step 9: validate views against presence
		this.views.loadFromRegistry()
		this.views.validateAgainstPresence()
		this.views.start()

		// Step 10: ready
		this.ready = true
		this.flushQueue()
		this.readyResolve()

		// graceful shutdown
		this.pagehideHandler = () => {
			this.presence.broadcastLeave()
			// release any view we hold
			const self = this.presence.getSelf()
			if (self.view) {
				this.views.release(self.view)
			}
		}
		window.addEventListener('pagehide', this.pagehideHandler)
	}

	private waitForTabs(expected: Set<string>, maxMs: number): Promise<void> {
		return new Promise((resolve) => {
			if (expected.size > 0) {
				// Wait for specific known tabs or timeout
				const check = () => {
					for (const tabId of expected) {
						if (!this.presence.isAlive(tabId)) return false
					}
					return true
				}
				if (check()) {
					resolve()
					return
				}
				const timeout = setTimeout(done, maxMs)
				const unsub = this.on('tab:join', () => {
					if (check()) done()
				})
				function done() {
					clearTimeout(timeout)
					unsub()
					resolve()
				}
			} else {
				// No known tabs — wait briefly for any announce, resolve on first join or timeout
				const timeout = setTimeout(done, maxMs)
				const unsub = this.on('tab:join', () => done())
				function done() {
					clearTimeout(timeout)
					unsub()
					resolve()
				}
			}
		})
	}

	private async syncState(): Promise<void> {
		// Always request sync — other tabs may exist even if not yet discovered via presence.
		// BroadcastChannel delivery is sub-millisecond, so a short timeout suffices.
		// If another tab exists, it responds almost instantly and done() fires.
		// If no tab exists, we wait the timeout and move on.
		return new Promise<void>((resolve) => {
			const unsub = this.channel.onMessage((msg) => {
				if (msg.type === 'state:sync') done()
			})
			const timeout = setTimeout(done, 150)
			this.state.requestSync()

			function done() {
				clearTimeout(timeout)
				unsub()
				resolve()
			}
		})
	}

	// ── Event system ──

	private emit(event: string, payload: unknown): void {
		const listeners = this.eventListeners.get(event)
		if (!listeners) return
		for (const cb of listeners) cb(payload)
	}

	on(event: string, cb: (payload: unknown) => void): () => void {
		let set = this.eventListeners.get(event)
		if (!set) {
			set = new Set()
			this.eventListeners.set(event, set)
		}
		set.add(cb)
		return () => set.delete(cb)
	}

	off(event: string, cb: (payload: unknown) => void): void {
		this.eventListeners.get(event)?.delete(cb)
	}

	// ── Leader callbacks ──

	addLeaderSetup(setup: () => (() => void) | undefined): () => void {
		const entry = { setup, cleanup: undefined as (() => void) | undefined }
		this.leaderSetups.push(entry)

		// if already leader, run immediately
		if (this.leader.isLeader()) {
			entry.cleanup = setup() ?? undefined
		}

		return () => {
			if (entry.cleanup) entry.cleanup()
			const idx = this.leaderSetups.indexOf(entry)
			if (idx >= 0) this.leaderSetups.splice(idx, 1)
		}
	}

	private runLeaderCallbacks(): void {
		for (const entry of this.leaderSetups) {
			if (this.leader.isLeader()) {
				if (!entry.cleanup) {
					entry.cleanup = entry.setup() ?? undefined
				}
			} else {
				if (entry.cleanup) {
					entry.cleanup()
					entry.cleanup = undefined
				}
			}
		}
	}

	// ── Queue ──

	private flushQueue(): void {
		for (const item of this.queue) item.fn()
		this.queue = []
	}

	enqueue(fn: () => void): void {
		if (this.ready) {
			fn()
		} else {
			this.queue.push({ fn })
		}
	}

	// ── Public accessors ──

	getState(): State<S> {
		return this.state
	}

	getViews(): Views {
		return this.views
	}

	getPresence(): Presence {
		return this.presence
	}

	getLeader(): Leader {
		return this.leader
	}

	getTabId(): string {
		return this.tabId
	}

	isReady(): boolean {
		return this.ready
	}

	destroy(): void {
		// run leader cleanups
		for (const entry of this.leaderSetups) {
			if (entry.cleanup) entry.cleanup()
		}
		this.leaderSetups = []

		// release views
		const self = this.presence.getSelf()
		if (self.view) this.views.release(self.view)

		// broadcast leave
		this.presence.broadcastLeave()

		// stop everything
		this.presence.stop()
		this.views.stop()
		this.registry.stopListening()
		this.channel.close()

		if (this.pagehideHandler) {
			window.removeEventListener('pagehide', this.pagehideHandler)
		}

		this.eventListeners.clear()
		this.queue = []
	}
}

// ── Layer 4: Public API ───────────────────────────────────────────────────

export function createWorkspace<S extends object = Record<string, unknown>>(
	namespace: string,
	options: WorkspaceOptions = {},
): Workspace<S> {
	if (!namespace) {
		throw new Error(
			'createWorkspace() requires a namespace string as the first argument. ' +
				"This identifies your workspace across tabs — e.g. createWorkspace('my-app').",
		)
	}

	const coord = new Coordinator<S>(namespace, options)

	const stateApi: WorkspaceState<S> = {
		set(key, value) {
			coord.enqueue(() => coord.getState().set(key, value))
		},
		get(key) {
			return coord.getState().get(key)
		},
		on(key: string, cb: (...args: unknown[]) => void) {
			if (key === '*') {
				return coord.getState().onWildcard(cb as (key: string, value: unknown) => void)
			}
			return coord.getState().onKey(key as keyof S & string, cb as (value: unknown) => void)
		},
		delete(key) {
			coord.enqueue(() => coord.getState().delete(key))
		},
	} as WorkspaceState<S>

	const viewsApi: WorkspaceViews = {
		get: (name) => coord.getViews().get(name),
		list: () => coord.getViews().listAll(),
		has: (name) => coord.getViews().has(name),
	}

	const tabsApi: WorkspaceTabs = {
		list: () => coord.getPresence().getAllTabs(),
		current: () => coord.getPresence().getSelf(),
		leader: () => {
			const lid = coord.getLeader().getLeaderId()
			if (!lid) return null
			return coord.getPresence().getTab(lid) ?? null
		},
	}

	const workspace: Workspace<S> = {
		state: stateApi,
		views: viewsApi,
		tabs: tabsApi,
		ready: coord.readyPromise,

		claim(viewName: string) {
			const currentView = coord.getPresence().getSelf().view
			if (currentView) {
				throw new Error(
					`app.claim('${viewName}') was called, but this tab already holds the '${currentView}' view. A tab can hold only one view at a time.`,
				)
			}
			coord.enqueue(() => {
				// Check for pending-open data written by the opener tab
				const pendingKey = `tabula:${namespace}:pending-open`
				try {
					const raw = localStorage.getItem(pendingKey)
					if (raw) {
						const pending = JSON.parse(raw) as {
							view?: string
							syncedState?: Record<string, unknown>
						}
						// Apply pre-synced state from the opener (instant, no round-trip)
						if (pending.syncedState && pending.view === viewName) {
							for (const [key, value] of Object.entries(pending.syncedState)) {
								if (coord.getState().get(key as keyof S & string) === undefined) {
									coord.getState().set(key as keyof S & string, value as S[keyof S & string])
								}
							}
						}
						localStorage.removeItem(pendingKey)
					}
				} catch {
					// ignore malformed pending data
				}
				coord.getViews().claim(viewName)
			})
		},

		async open(viewName: string, opts: ViewOpenOptions<S>): Promise<ViewHandle> {
			const existing = coord.getViews().get(viewName)
			if (existing) {
				const self = coord.getPresence().getSelf()
				coord.getViews().focus(viewName)
				throw Object.assign(new Error(`View '${viewName}' is already held by another tab.`), {
					existing,
					self,
				})
			}

			// Write pending-open intent to localStorage so the new tab can read it
			// without polluting the URL. The new tab reads this on init via app.claim().
			const pendingKey = `tabula:${namespace}:pending-open`
			const pendingData: Record<string, unknown> = { view: viewName }
			if (opts.syncKeys) {
				pendingData.syncedState = coord.getState().getKeysForSync(opts.syncKeys)
			}
			localStorage.setItem(pendingKey, JSON.stringify(pendingData))

			const opened = window.open(new URL(opts.url, window.location.href).toString())
			if (!opened) {
				throw new Error(
					`Failed to open tab for view '${viewName}'. The browser may have blocked the popup. app.open() must be called in direct response to a user gesture (click, keyboard).`,
				)
			}

			// wait for the new tab to claim the view
			const claimed = await new Promise<boolean>((resolve) => {
				const timeout = setTimeout(() => resolve(false), 5000)
				const unsub = coord.on('view:claimed', (payload: unknown) => {
					const e = payload as ViewClaimedEvent
					if (e.name === viewName) {
						clearTimeout(timeout)
						unsub()
						resolve(true)
					}
				})
			})

			if (!claimed) {
				throw new Error(
					`View '${viewName}' was not claimed by the new tab within 5 seconds. Make sure the opened page calls app.claim('${viewName}').`,
				)
			}

			// return handle
			const handleListeners = new Map<string, Set<(...args: unknown[]) => void>>()

			const handle: ViewHandle = {
				on(event: string, cb: (...args: unknown[]) => void) {
					let set = handleListeners.get(event)
					if (!set) {
						set = new Set()
						handleListeners.set(event, set)
					}
					set.add(cb)

					let unsub: (() => void) | undefined
					if (event === 'vacant') {
						unsub = coord.on('view:vacant', (payload: unknown) => {
							const e = payload as ViewVacantEvent
							if (e.name === viewName) cb()
						})
					} else if (event === 'conflict') {
						unsub = coord.on('view:conflict', (payload: unknown) => {
							const e = payload as ViewConflictEvent
							if (e.name === viewName) cb({ existing: e.existing, incoming: e.incoming })
						})
					}

					return () => {
						set.delete(cb)
						unsub?.()
					}
				},
				release() {
					coord.getViews().release(viewName)
				},
				focus() {
					coord.getViews().focus(viewName)
				},
			} as ViewHandle

			return handle
		},

		focus(viewName: string) {
			coord.getViews().focus(viewName)
		},

		destroy() {
			coord.destroy()
		},

		onLeader(setup) {
			return coord.addLeaderSetup(setup)
		},

		isLeader() {
			return coord.getLeader().isLeader()
		},

		on(event: string, cb: (payload: unknown) => void) {
			return coord.on(event, cb)
		},

		off(event: string, cb: (payload: unknown) => void) {
			coord.off(event, cb)
		},
	} as Workspace<S>

	return workspace
}
