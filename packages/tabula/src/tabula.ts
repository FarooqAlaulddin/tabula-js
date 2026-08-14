// ════════════════════════════════════════════════════════════════════════════
// Tabula — Coordinate browser tabs as views of a single workspace
// Single-file core. Zero dependencies. ~6kb gzipped target.
// ════════════════════════════════════════════════════════════════════════════

import {
	LOCAL_PROTOCOL,
	MAX_PRESENCE_PEERS,
	MAX_STATE_KEYS,
	type Message,
	type MessageIdentity,
	type MessageTarget,
	type MessageType,
	type ProtocolIncompatibleEvent,
	type StateClock,
	type StateOperation,
	type StateSyncRequestPayload,
	type StateSyncResponsePayload,
	isValidId,
	isValidName,
	isValidStateKey,
	structuralBudgetIsValid,
	validateInboundMessage,
	validateStoredPresence,
	validateStoredViewRegistryEntry,
} from './protocol'
import {
	StorageCorruptionError,
	StorageOperationError,
	WorkspaceDestroyedError,
	WorkspaceFailedError,
	type WorkspaceLifecycle,
	type WorkspaceStatus,
	type WorkspaceSyncState,
	assertBaselineCapabilities,
	getDocumentIdentity,
	nextMessageId,
	storageGet,
	storageRemove,
	storageSet,
} from './runtime'

export type {
	Message,
	MessageIdentity,
	MessageTarget,
	MessageType,
	ProtocolIncompatibleEvent,
	ProtocolVersion,
	StateClock,
	StateDeleteOperation,
	StateOperation,
	StateSetOperation,
	StateSyncRequestPayload,
	StateSyncResponsePayload,
} from './protocol'
export {
	CapabilityError,
	StorageCorruptionError,
	StorageOperationError,
	WorkspaceDestroyedError,
	WorkspaceFailedError,
} from './runtime'
export type { WorkspaceLifecycle, WorkspaceStatus, WorkspaceSyncState } from './runtime'

// ── Types ─────────────────────────────────────────────────────────────────

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
	readyTimeout?: number
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
	'protocol:incompatible': ProtocolIncompatibleEvent
	'sync:status': WorkspaceStatus
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
	status(): WorkspaceStatus
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
	keys(): Array<keyof S & string>
	entries(): Array<[keyof S & string, S[keyof S & string]]>
	setAll(entries: Partial<S>): void
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
	const existing = storageGet(sessionStorage, 'sessionStorage', 'tabula:tab-id')
	if (isValidId(existing)) return existing

	const id = crypto.randomUUID()
	storageSet(sessionStorage, 'sessionStorage', 'tabula:tab-id', id)
	return id
}

function replaceTabId(id: string): void {
	storageSet(sessionStorage, 'sessionStorage', 'tabula:tab-id', id)
}

/** @internal */ export function getSessionEpoch(): string {
	const existing = storageGet(sessionStorage, 'sessionStorage', 'tabula:epoch')
	if (isValidId(existing)) return existing
	const epoch = Date.now().toString()
	storageSet(sessionStorage, 'sessionStorage', 'tabula:epoch', epoch)
	return epoch
}

/** @internal — exported for testing only */
export class Dedup {
	private seen = new Map<string, number>()
	private readonly limit: number
	private readonly ttlMs: number
	private readonly now: () => number

	constructor(limit = 2048, ttlMs = 5 * 60_000, now: () => number = Date.now) {
		this.limit = limit
		this.ttlMs = ttlMs
		this.now = now
	}

	isDuplicate(id: string): boolean {
		const now = this.now()
		const previous = this.seen.get(id)
		if (previous !== undefined && now - previous <= this.ttlMs) return true
		if (previous !== undefined) this.seen.delete(id)
		this.prune(now)
		this.seen.set(id, now)
		while (this.seen.size > this.limit) {
			const oldest = this.seen.keys().next().value
			if (oldest === undefined) break
			this.seen.delete(oldest)
		}
		return false
	}

	get size(): number {
		return this.seen.size
	}

	private prune(now: number): void {
		for (const [id, seenAt] of this.seen) {
			if (now - seenAt <= this.ttlMs) break
			this.seen.delete(id)
		}
	}
}

type MsgHandler = (msg: Message) => void

/** @internal */ export class Channel {
	private bc: BroadcastChannel
	private handlers = new Set<MsgHandler>()
	private dedup = new Dedup()
	private identity: MessageIdentity
	private incompatibilities = new Map<string, number>()
	private incompatibilityHandlers = new Set<(event: ProtocolIncompatibleEvent) => void>()
	private warnedAtCapacity = false
	private closed = false

	constructor(namespace: string, tabId: string, instanceId: string = crypto.randomUUID()) {
		if (typeof BroadcastChannel === 'undefined') {
			throw new Error(
				'Tabula requires BroadcastChannel. Supported in all modern browsers. ' +
					'For Node.js testing, use @farooqalaulddin/tabula-js/testing.',
			)
		}
		this.bc = new BroadcastChannel(`tabula:${namespace}`)
		this.identity = { tabId, instanceId }
		this.bc.onmessage = (e: MessageEvent) => {
			const result = validateInboundMessage(e.data)
			if (result.kind === 'invalid' || result.kind === 'unknown') return
			if (result.kind === 'incompatible') {
				if (!this.matchesTarget(result.to)) return
				if (
					result.peer.tabId === this.identity.tabId &&
					result.peer.instanceId === this.identity.instanceId
				) {
					return
				}
				const firstReport = this.reportIncompatible(result.peer, result.remote)
				if (firstReport && result.type !== 'protocol:reject') {
					this.send(
						'protocol:reject',
						{
							local: LOCAL_PROTOCOL,
							remote: result.remote,
							recovery: 'Save work and reload all application tabs.',
						},
						result.peer,
					)
				}
				return
			}
			const msg = result.message
			if (!this.matchesTarget(msg.to)) return
			if (
				msg.from.tabId === this.identity.tabId &&
				msg.from.instanceId === this.identity.instanceId
			) {
				return
			}
			if (msg.type === 'protocol:reject') return
			if (this.dedup.isDuplicate(msg.id)) return
			for (const h of this.handlers) h(msg)
		}
	}

	send<T>(type: MessageType, payload: T, to?: string | MessageTarget): Message<T> {
		const msg: Message<T> = {
			protocol: LOCAL_PROTOCOL,
			type,
			from: this.identity,
			...(to ? { to: typeof to === 'string' ? { tabId: to } : to } : {}),
			payload,
			id: nextMessageId(this.identity.instanceId),
			sentAt: Date.now(),
		}
		if (!this.closed) this.bc.postMessage(msg)
		return msg
	}

	getIdentity(): MessageIdentity {
		return { ...this.identity }
	}

	replaceTabId(tabId: string): void {
		this.identity = { ...this.identity, tabId }
	}

	onMessage(handler: MsgHandler): () => void {
		this.handlers.add(handler)
		return () => this.handlers.delete(handler)
	}

	onProtocolIncompatible(handler: (event: ProtocolIncompatibleEvent) => void): () => void {
		this.incompatibilityHandlers.add(handler)
		return () => this.incompatibilityHandlers.delete(handler)
	}

	close(): void {
		this.closed = true
		this.handlers.clear()
		this.incompatibilityHandlers.clear()
		this.bc.close()
	}

	private matchesTarget(target?: MessageTarget): boolean {
		return (
			!target ||
			(target.tabId === this.identity.tabId &&
				(target.instanceId === undefined || target.instanceId === this.identity.instanceId))
		)
	}

	private reportIncompatible(
		peer: MessageIdentity,
		remote: ProtocolIncompatibleEvent['remote'],
	): boolean {
		const key = `${peer.instanceId}\0${remote.major}\0${remote.minRevision}\0${remote.revision}`
		if (this.incompatibilities.has(key)) return false
		if (this.incompatibilities.size >= 128) {
			if (!this.warnedAtCapacity) {
				this.warnedAtCapacity = true
				console.warn('Tabula protocol incompatibility reporting reached its 128-peer limit.')
			}
			return false
		}
		this.incompatibilities.set(key, Date.now())
		const event: ProtocolIncompatibleEvent = {
			peer,
			local: LOCAL_PROTOCOL,
			remote,
			recovery: 'Save work and reload all application tabs.',
		}
		for (const handler of this.incompatibilityHandlers) handler(event)
		return true
	}
}

/** @internal */ export class Registry {
	private prefix: string
	private handler: ((e: StorageEvent) => void) | null = null
	private listeners = new Set<(view: string, entry: ViewRegistryEntry | null) => void>()
	private knownViews = new Set<string>()
	private scannedOnce = false
	private warnedCorruption = false

	constructor(namespace: string) {
		this.prefix = `tabula:${namespace}:view:`
	}

	/** Scan localStorage once to seed the knownViews set */
	private ensureScanned(): void {
		if (this.scannedOnce) return
		this.scannedOnce = true
		try {
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i)
				if (key?.startsWith(this.prefix)) {
					const view = key.slice(this.prefix.length)
					if (isValidName(view)) this.knownViews.add(view)
				}
			}
		} catch (cause) {
			throw new StorageOperationError('localStorage', 'read', cause)
		}
	}

	get(view: string): ViewRegistryEntry | null {
		if (!isValidName(view)) return null
		const key = this.prefix + view
		const raw = storageGet(localStorage, 'localStorage', key)
		if (!raw) return null
		try {
			const entry = validateStoredViewRegistryEntry(JSON.parse(raw))
			if (entry) return entry
		} catch {
			// Quarantine malformed non-authoritative projections below.
		}
		this.quarantine(key)
		return null
	}

	set(view: string, entry: ViewRegistryEntry): void {
		storageSet(localStorage, 'localStorage', this.prefix + view, JSON.stringify(entry))
		this.knownViews.add(view)
	}

	delete(view: string): void {
		storageRemove(localStorage, 'localStorage', this.prefix + view)
		this.knownViews.delete(view)
	}

	list(): Record<string, ViewRegistryEntry> {
		this.ensureScanned()
		const out = Object.create(null) as Record<string, ViewRegistryEntry>
		for (const view of this.knownViews) {
			const entry = this.get(view)
			if (entry) {
				out[view] = entry
			} else {
				// entry was removed externally — clean up the set
				this.knownViews.delete(view)
			}
		}
		return out
	}

	clearStale(epoch: string): string[] {
		this.ensureScanned()
		const cleared: string[] = []
		for (const view of this.knownViews) {
			const entry = this.get(view)
			if (!entry || entry.epoch !== epoch) {
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
			if (!isValidName(view)) return
			let entry: ViewRegistryEntry | null = null
			if (e.newValue) {
				try {
					entry = validateStoredViewRegistryEntry(JSON.parse(e.newValue))
				} catch {
					/* ignore */
				}
				if (!entry) return
				this.knownViews.add(view)
			} else {
				this.knownViews.delete(view)
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

	private quarantine(key: string): void {
		try {
			storageRemove(localStorage, 'localStorage', key)
		} catch {
			// A later operation will surface continuing storage loss.
		}
		if (!this.warnedCorruption) {
			this.warnedCorruption = true
			console.warn('Tabula removed a corrupt view-registry projection from localStorage.')
		}
	}
}

// ── Layer 2: Presence ─────────────────────────────────────────────────────

interface AnnouncePayload {
	visible: boolean
	view: string | null
	createdAt: number // tab's actual creation time, used for leader election
}

/** @internal */ export class Presence {
	tabId: string
	private tabMap = new Map<string, TabMeta>()
	private channel: Channel
	private heartbeatMs: number
	private timeoutMs: number
	private tickTimer: ReturnType<typeof setInterval> | null = null
	private onJoin: (tab: TabMeta) => void
	private onLeave: (tab: TabMeta) => void
	private currentView: string | null = null
	private visibilityHandler: (() => void) | null = null
	private createdAt: number
	private presencePrefix: string
	private warnedAtCapacity = false
	private started = false
	private warnedStorage = false

	constructor(
		channel: Channel,
		tabId: string,
		heartbeatMs: number,
		timeoutMs: number,
		onJoin: (tab: TabMeta) => void,
		onLeave: (tab: TabMeta) => void,
		namespace: string,
	) {
		this.channel = channel
		this.tabId = tabId
		this.heartbeatMs = heartbeatMs
		this.timeoutMs = timeoutMs
		this.onJoin = onJoin
		this.onLeave = onLeave
		this.createdAt = Date.now()
		this.presencePrefix = `tabula:${namespace}:tab:`

		// register self
		const self: TabMeta = {
			id: tabId,
			view: null,
			visible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
			firstSeenAt: this.createdAt,
			lastSeenAt: this.createdAt,
		}
		this.tabMap.set(tabId, self)
	}

	start(): void {
		if (this.started) return
		this.started = true
		// announce to others
		this.announce()

		// Single timer: heartbeat (localStorage + BC) and prune dead tabs
		this.tickTimer = setInterval(() => {
			this.updateSelf()
			this.writePresence()
			this.channel.send<null>('tab:heartbeat', null)
			this.prune()
		}, this.heartbeatMs)

		// visibility tracking
		if (typeof document !== 'undefined') {
			this.visibilityHandler = () => {
				this.updateSelf()
				this.writePresence()
				if (document.visibilityState === 'visible') {
					this.announce()
				}
			}
			document.addEventListener('visibilitychange', this.visibilityHandler)
		}
	}

	announce(): void {
		this.writePresence()
		const payload: AnnouncePayload = {
			visible: this.getSelf().visible,
			view: this.currentView,
			createdAt: this.createdAt,
		}
		this.channel.send('tab:announce', payload)
	}

	handleMessage(msg: Message): void {
		if (msg.type === 'tab:announce') {
			const payload = msg.payload as AnnouncePayload
			const senderTabId = msg.from.tabId
			const existing = this.tabMap.get(senderTabId)
			if (!existing && this.tabMap.size >= MAX_PRESENCE_PEERS) {
				if (!this.warnedAtCapacity) {
					this.warnedAtCapacity = true
					console.warn('Tabula presence reached its 256-peer limit; new peers are ignored.')
				}
				return
			}
			const tab: TabMeta = {
				id: senderTabId,
				view: payload.view,
				visible: payload.visible,
				firstSeenAt: existing?.firstSeenAt ?? payload.createdAt ?? Date.now(),
				lastSeenAt: Date.now(),
			}
			this.tabMap.set(senderTabId, tab)
			if (!existing) this.onJoin(tab)
			if (!existing) this.announce()
		} else if (msg.type === 'tab:heartbeat') {
			const existing = this.tabMap.get(msg.from.tabId)
			if (existing) {
				existing.lastSeenAt = Date.now()
			}
			// If unknown, prune() will discover them via localStorage if alive
		} else if (msg.type === 'tab:leave') {
			const senderTabId = msg.from.tabId
			const tab = this.tabMap.get(senderTabId)
			if (tab) {
				this.tabMap.delete(senderTabId)
				this.removePresenceEntry(senderTabId)
				this.onLeave(tab)
			}
		}
	}

	setView(view: string | null): void {
		this.currentView = view
		const self = this.tabMap.get(this.tabId)
		if (self) self.view = view
		this.writePresence()
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

	discoverStoredPeers(): void {
		const now = Date.now()
		try {
			for (let index = 0; index < localStorage.length; index++) {
				const key = localStorage.key(index)
				if (!key?.startsWith(this.presencePrefix)) continue
				const tabId = key.slice(this.presencePrefix.length)
				if (tabId === this.tabId || !isValidId(tabId) || this.tabMap.has(tabId)) continue
				const raw = localStorage.getItem(key)
				if (!raw) continue
				let entry: ReturnType<typeof validateStoredPresence>
				try {
					entry = validateStoredPresence(JSON.parse(raw))
				} catch {
					continue
				}
				if (!entry || now - entry.lastSeen > this.timeoutMs * 3) continue
				if (this.tabMap.size >= MAX_PRESENCE_PEERS) {
					if (!this.warnedAtCapacity) {
						this.warnedAtCapacity = true
						console.warn('Tabula presence reached its 256-peer limit; new peers are ignored.')
					}
					return
				}
				const tab: TabMeta = {
					id: tabId,
					view: entry.view ?? null,
					visible: entry.visible ?? true,
					firstSeenAt: entry.createdAt,
					lastSeenAt: entry.lastSeen,
				}
				this.tabMap.set(tabId, tab)
				this.onJoin(tab)
			}
		} catch (cause) {
			throw new StorageOperationError('localStorage', 'read', cause)
		}
	}

	isAlive(tabId: string): boolean {
		return this.tabMap.has(tabId)
	}

	broadcastLeave(): void {
		this.channel.send<null>('tab:leave', null)
		this.removePresenceEntry(this.tabId)
	}

	stop(): void {
		if (this.tickTimer) clearInterval(this.tickTimer)
		if (this.visibilityHandler && typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.visibilityHandler)
		}
		this.tickTimer = null
		this.visibilityHandler = null
		this.started = false
	}

	reidentify(tabId: string): void {
		const oldTabId = this.tabId
		const self = this.getSelf()
		this.removePresenceEntry(oldTabId)
		this.tabMap.delete(oldTabId)
		this.tabId = tabId
		self.id = tabId
		self.firstSeenAt = Date.now()
		self.lastSeenAt = self.firstSeenAt
		self.view = null
		this.currentView = null
		this.tabMap.set(tabId, self)
		this.writePresence()
	}

	private updateSelf(): void {
		const self = this.tabMap.get(this.tabId)
		if (self) {
			self.visible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
			self.lastSeenAt = Date.now()
		}
	}

	/** Write this tab's presence to localStorage (not throttled by Chrome). */
	private writePresence(): void {
		try {
			storageSet(
				localStorage,
				'localStorage',
				this.presencePrefix + this.tabId,
				JSON.stringify({
					lastSeen: Date.now(),
					createdAt: this.createdAt,
					visible: this.getSelf().visible,
					view: this.currentView,
				}),
			)
		} catch (error) {
			this.warnStorage(error)
		}
	}

	private removePresenceEntry(tabId: string): void {
		try {
			storageRemove(localStorage, 'localStorage', this.presencePrefix + tabId)
		} catch (error) {
			this.warnStorage(error)
		}
	}

	private warnStorage(error: unknown): void {
		if (this.warnedStorage) return
		this.warnedStorage = true
		console.warn('Tabula presence could not update its localStorage projection.', error)
	}

	private prune(): void {
		const now = Date.now()
		for (const [id, tab] of this.tabMap) {
			if (id === this.tabId) continue

			// Check localStorage for this tab's last activity (not throttled)
			let lastActivity = tab.lastSeenAt
			try {
				const raw = localStorage.getItem(this.presencePrefix + id)
				if (raw) {
					const entry = validateStoredPresence(JSON.parse(raw))
					if (!entry) continue
					if (entry.lastSeen > lastActivity) {
						lastActivity = entry.lastSeen
						// Update in-memory from localStorage
						tab.lastSeenAt = entry.lastSeen
						if (entry.visible !== undefined) tab.visible = entry.visible
						if (entry.view !== undefined) tab.view = entry.view
					}
				} else {
					// No localStorage entry = tab cleaned up or crashed
					// Use a short timeout
					if (now - lastActivity > this.timeoutMs) {
						this.tabMap.delete(id)
						this.onLeave(tab)
					}
					continue
				}
			} catch {
				// ignore parse errors
			}

			// Prune only if localStorage timestamp is also stale.
			// Use generous timeout since localStorage writes can be delayed by heavy JS.
			if (now - lastActivity > this.timeoutMs * 3) {
				this.tabMap.delete(id)
				this.removePresenceEntry(id)
				this.onLeave(tab)
			}
		}
	}
}

// ── Layer 2: Leader ───────────────────────────────────────────────────────

interface LeaderProjection {
	generation: number
	tabId: string
	instanceId: string
}

/** @internal */ export class Leader {
	private readonly lockName: string
	private readonly generationKey: string
	private readonly channel: Channel
	private presence: Presence
	private projection: LeaderProjection | null = null
	private readonly onChange: (leaderId: string) => void
	private readonly onAuthorityChange: (held: boolean) => void
	private readonly onError: (error: unknown) => void
	private active = false
	private held = false
	private runVersion = 0
	private acquisitionAbort: AbortController | null = null
	private releaseHeld: (() => void) | null = null

	constructor(
		namespace: string,
		channel: Channel,
		presence: Presence,
		onChange: (leaderId: string) => void,
		onAuthorityChange: (held: boolean) => void = () => undefined,
		onError: (error: unknown) => void = () => undefined,
	) {
		const encodedNamespace = encodeURIComponent(namespace)
		this.lockName = `tabula-js:v1:${encodedNamespace}:leader`
		this.generationKey = `tabula:${encodedNamespace}:leader-generation`
		this.channel = channel
		this.presence = presence
		this.onChange = onChange
		this.onAuthorityChange = onAuthorityChange
		this.onError = onError
	}

	start(): void {
		if (this.active) return
		this.active = true
		const runVersion = ++this.runVersion
		const controller = new AbortController()
		this.acquisitionAbort = controller
		this.channel.send<null>('leader:query', null)

		void navigator.locks
			.request(this.lockName, { mode: 'exclusive', signal: controller.signal }, async () => {
				if (!this.active || runVersion !== this.runVersion) return
				const generation = this.incrementGeneration()
				const identity = this.channel.getIdentity()
				const projection = { generation, tabId: identity.tabId, instanceId: identity.instanceId }
				this.held = true

				try {
					this.acceptProjection(projection)
					this.announce(projection)
					this.onAuthorityChange(true)
					await new Promise<void>((resolve) => {
						this.releaseHeld = resolve
					})
				} finally {
					this.releaseHeld = null
					if (this.held) {
						this.held = false
						this.onAuthorityChange(false)
					}
				}
			})
			.catch((error: unknown) => {
				if (runVersion !== this.runVersion || controller.signal.aborted) return
				this.onError(error)
			})
	}

	getLeaderId(): string | null {
		return this.projection?.tabId ?? null
	}

	isLeader(): boolean {
		return this.held
	}

	handleMessage(msg: Message): void {
		if (msg.type === 'leader:query') {
			if (this.held && this.projection) this.announce(this.projection, msg.from)
			return
		}
		if (msg.type !== 'leader:change') return
		const payload = msg.payload as Partial<LeaderProjection>
		if (
			typeof payload.generation !== 'number' ||
			typeof payload.tabId !== 'string' ||
			typeof payload.instanceId !== 'string'
		) {
			return
		}
		this.acceptProjection({
			generation: payload.generation,
			tabId: payload.tabId,
			instanceId: payload.instanceId,
		})
	}

	refreshProjection(): void {
		if (this.projection && this.presence.getTab(this.projection.tabId)) {
			this.onChange(this.projection.tabId)
		}
	}

	stop(): void {
		if (!this.active && !this.held) return
		this.active = false
		this.runVersion++
		this.acquisitionAbort?.abort()
		this.acquisitionAbort = null
		if (this.held) {
			this.held = false
			try {
				this.onAuthorityChange(false)
			} finally {
				this.releaseHeld?.()
			}
			return
		}
		this.releaseHeld?.()
	}

	reset(): void {
		this.stop()
		this.projection = null
	}

	private incrementGeneration(): number {
		const raw = storageGet(localStorage, 'localStorage', this.generationKey)
		let current = 0
		if (raw !== null) {
			if (!/^(0|[1-9]\d*)$/.test(raw)) {
				throw new StorageCorruptionError(this.generationKey)
			}
			current = Number(raw)
			if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
				throw new StorageCorruptionError(this.generationKey)
			}
		}
		const next = current + 1
		storageSet(localStorage, 'localStorage', this.generationKey, String(next))
		return next
	}

	private announce(projection: LeaderProjection, to?: MessageIdentity): void {
		this.channel.send('leader:change', projection, to)
	}

	private acceptProjection(incoming: LeaderProjection): void {
		const current = this.projection
		if (current) {
			if (incoming.generation < current.generation) return
			if (
				incoming.generation === current.generation &&
				(incoming.tabId !== current.tabId || incoming.instanceId !== current.instanceId)
			) {
				return
			}
			if (
				incoming.generation === current.generation &&
				incoming.tabId === current.tabId &&
				incoming.instanceId === current.instanceId
			) {
				return
			}
		}
		this.projection = incoming
		this.refreshProjection()
	}
}

// ── Layer 2: State ────────────────────────────────────────────────────────

/** @internal */ export class State<S extends object> {
	private entries = new Map<string, StateOperation>()
	private keyListeners = new Map<string, Set<(value: unknown) => void>>()
	private wildcardListeners = new Set<(key: string, value: unknown) => void>()
	private channel: Channel
	private wallTime = 0
	private logical = 0

	constructor(channel: Channel, _tabId: string) {
		this.channel = channel
	}

	set<K extends keyof S & string>(key: K, value: S[K]): void {
		this.assertKey(key)
		this.ensureCapacity([key])
		const cloned = this.cloneValue(value)
		const operation = this.createOperation(key, 'set', cloned)
		if (!structuralBudgetIsValid({ operation })) {
			throw new TypeError('State operation exceeds Tabula message safety limits.')
		}
		this.channel.send('state:set', { operation })
		this.applyOperations([operation])
	}

	get<K extends keyof S & string>(key: K): S[K] | undefined {
		const operation = this.entries.get(key)
		return operation?.kind === 'set' ? (operation.value as S[K]) : undefined
	}

	delete<K extends keyof S & string>(key: K): void {
		this.assertKey(key)
		this.ensureCapacity([key])
		const operation = this.createOperation(key, 'delete')
		this.channel.send('state:delete', { operation })
		this.applyOperations([operation])
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
			const operation = this.operationFromSetMessage(msg)
			if (operation) this.acceptRemoteOperations([operation], msg.from, true)
		} else if (msg.type === 'state:delete') {
			const operation = this.operationFromDeleteMessage(msg)
			if (operation) this.acceptRemoteOperations([operation], msg.from, true)
		} else if (msg.type === 'state:batch') {
			const { operations } = msg.payload as { operations: StateOperation[] }
			this.acceptRemoteOperations(operations, msg.from, true)
		} else if (msg.type === 'state:sync-request' && msg.payload === null) {
			const snapshot: Record<string, StateOperation> = Object.create(null)
			for (const [k, v] of this.entries) snapshot[k] = v
			this.channel.send('state:sync', { state: snapshot }, msg.from)
		} else if (
			msg.type === 'state:sync' &&
			typeof msg.payload === 'object' &&
			msg.payload !== null &&
			!('requestId' in msg.payload)
		) {
			this.mergeSyncMessage(msg)
		}
	}

	mergeSyncMessage(msg: Message): void {
		const { state: snapshot } = msg.payload as {
			state: Record<string, StateOperation | StateEntry>
		}
		const operations = Object.entries(snapshot).map(([key, entry]) =>
			this.operationFromSnapshot(key, entry, msg),
		)
		this.acceptRemoteOperations(
			operations.filter((operation): operation is StateOperation => operation !== null),
			msg.from,
			false,
		)
	}

	requestSync(payload?: StateSyncRequestPayload): void {
		this.channel.send('state:sync-request', payload ?? null)
	}

	reidentify(_tabId: string): void {
		// Channel identity is the actor source and is updated by the coordinator.
	}

	stop(): void {
		this.keyListeners.clear()
		this.wildcardListeners.clear()
	}

	getSnapshot(): Record<string, StateOperation> {
		const out: Record<string, StateOperation> = Object.create(null)
		for (const [k, v] of this.entries) out[k] = v
		return out
	}

	keys(): string[] {
		return [...this.entries].filter(([, operation]) => operation.kind === 'set').map(([key]) => key)
	}

	allEntries(): Array<[string, unknown]> {
		return [...this.entries]
			.filter(([, operation]) => operation.kind === 'set')
			.map(([key, operation]) => [
				key,
				(operation as Extract<StateOperation, { kind: 'set' }>).value,
			])
	}

	setAll(entries: Record<string, unknown>): void {
		const normalized = Object.entries(entries).sort(([left], [right]) =>
			this.compareStrings(left, right),
		)
		if (normalized.length === 0) return
		for (const [key] of normalized) this.assertKey(key)
		this.ensureCapacity(normalized.map(([key]) => key))
		const cloned = normalized.map(([key, value]) => [key, this.cloneValue(value)] as const)
		const operations = cloned.map(([key, value]) => this.createOperation(key, 'set', value))
		if (!structuralBudgetIsValid({ operations })) {
			throw new TypeError('State batch exceeds Tabula message safety limits.')
		}
		this.channel.send('state:batch', { operations })
		this.applyOperations(operations)
	}

	getKeysForSync(keys: string[]): Record<string, unknown> {
		const out: Record<string, unknown> = {}
		for (const key of keys) {
			const operation = this.entries.get(key)
			if (operation?.kind === 'set') out[key] = operation.value
		}
		return out
	}

	private assertKey(key: string): void {
		if (!isValidStateKey(key)) {
			throw new TypeError('State keys must be non-empty, safe strings of at most 256 UTF-8 bytes.')
		}
	}

	private ensureCapacity(keys: string[]): void {
		const additions = new Set(keys.filter((key) => !this.entries.has(key)))
		if (this.entries.size + additions.size > MAX_STATE_KEYS) {
			throw new RangeError(`Tabula state is limited to ${MAX_STATE_KEYS} observed keys.`)
		}
	}

	private cloneValue(value: unknown): unknown {
		if (value === undefined) {
			throw new TypeError('state.set() does not accept undefined; use state.delete() for absence.')
		}
		if (!structuralBudgetIsValid(value)) {
			throw new TypeError('State value exceeds Tabula structured-clone safety limits.')
		}
		return structuredClone(value)
	}

	private createOperation(key: string, kind: 'set', value: unknown): StateOperation
	private createOperation(key: string, kind: 'delete'): StateOperation
	private createOperation(key: string, kind: 'set' | 'delete', value?: unknown): StateOperation {
		const identity = this.channel.getIdentity()
		const base = {
			key,
			clock: this.tick(),
			tabId: identity.tabId,
			instanceId: identity.instanceId,
			operationId: crypto.randomUUID(),
		}
		return kind === 'set' ? { ...base, kind, value } : { ...base, kind }
	}

	private tick(remote?: StateClock): StateClock {
		const now = Date.now()
		const previousWall = this.wallTime
		const previousLogical = this.logical
		const remoteWall = remote?.wallTime ?? -1
		const wallTime = Math.max(now, previousWall, remoteWall)
		if (remote && wallTime === previousWall && wallTime === remoteWall) {
			this.logical = Math.max(previousLogical, remote.logical) + 1
		} else if (wallTime === previousWall) {
			this.logical = previousLogical + 1
		} else if (remote && wallTime === remoteWall) {
			this.logical = remote.logical + 1
		} else {
			this.logical = 0
		}
		this.wallTime = wallTime
		return { wallTime, logical: this.logical }
	}

	private acceptRemoteOperations(
		operations: StateOperation[],
		sender: MessageIdentity,
		requireSenderMatch: boolean,
	): void {
		const accepted: StateOperation[] = []
		const newKeys = new Set<string>()
		for (const operation of operations) {
			if (
				requireSenderMatch &&
				(operation.tabId !== sender.tabId || operation.instanceId !== sender.instanceId)
			) {
				continue
			}
			this.tick(operation.clock)
			if (!this.entries.has(operation.key) && !newKeys.has(operation.key)) {
				if (this.entries.size + newKeys.size >= MAX_STATE_KEYS) continue
				newKeys.add(operation.key)
			}
			const existing = this.entries.get(operation.key)
			if (!existing || this.compareOperations(operation, existing) > 0) accepted.push(operation)
		}
		this.applyOperations(accepted)
	}

	private applyOperations(operations: StateOperation[]): void {
		const winners = [...operations]
			.sort((left, right) => this.compareStrings(left.key, right.key))
			.filter((operation) => {
				const existing = this.entries.get(operation.key)
				return !existing || this.compareOperations(operation, existing) > 0
			})
		for (const operation of winners) this.entries.set(operation.key, operation)
		for (const operation of winners) this.notifyKey(operation.key, this.operationValue(operation))
		for (const operation of winners)
			this.notifyWildcard(operation.key, this.operationValue(operation))
	}

	private compareOperations(left: StateOperation, right: StateOperation): number {
		for (const [leftValue, rightValue] of [
			[left.clock.wallTime, right.clock.wallTime],
			[left.clock.logical, right.clock.logical],
		] as const) {
			if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1
		}
		for (const [leftValue, rightValue] of [
			[left.tabId, right.tabId],
			[left.instanceId, right.instanceId],
			[left.operationId, right.operationId],
		] as const) {
			const comparison = this.compareStrings(leftValue, rightValue)
			if (comparison !== 0) return comparison
		}
		return 0
	}

	private compareStrings(left: string, right: string): number {
		return left === right ? 0 : left < right ? -1 : 1
	}

	private operationValue(operation: StateOperation): unknown {
		return operation.kind === 'set' ? operation.value : undefined
	}

	private notifyKey(key: string, value: unknown): void {
		const listeners = this.keyListeners.get(key)
		if (listeners) for (const cb of listeners) cb(value)
	}

	private notifyWildcard(key: string, value: unknown): void {
		for (const cb of this.wildcardListeners) cb(key, value)
	}

	private operationFromSetMessage(msg: Message): StateOperation | null {
		const payload = msg.payload as { operation?: StateOperation; key?: string; entry?: StateEntry }
		if (payload.operation) return payload.operation
		if (!payload.key || !payload.entry) return null
		return {
			kind: 'set',
			key: payload.key,
			value: payload.entry.value,
			clock: { wallTime: payload.entry.ts, logical: payload.entry.version },
			tabId: payload.entry.tabId,
			instanceId: msg.from.instanceId,
			operationId: `legacy:${msg.id}`,
		}
	}

	private operationFromDeleteMessage(msg: Message): StateOperation | null {
		const payload = msg.payload as { operation?: StateOperation; key?: string }
		if (payload.operation) return payload.operation
		if (!payload.key) return null
		return {
			kind: 'delete',
			key: payload.key,
			clock: { wallTime: msg.sentAt, logical: 0 },
			tabId: msg.from.tabId,
			instanceId: msg.from.instanceId,
			operationId: `legacy:${msg.id}`,
		}
	}

	private operationFromSnapshot(
		key: string,
		entry: StateOperation | StateEntry,
		msg: Message,
	): StateOperation | null {
		if ('kind' in entry) return entry.key === key ? entry : null
		return {
			kind: 'set',
			key,
			value: entry.value,
			clock: { wallTime: entry.ts, logical: entry.version },
			tabId: entry.tabId,
			instanceId: msg.from.instanceId,
			operationId: `legacy:${msg.id}:${key}`,
		}
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
	private registryUnsubscribe: (() => void) | null = null
	private started = false

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
		if (this.started) return
		this.started = true
		// listen for storage events as secondary sync
		this.registryUnsubscribe = this.registry.onChange((viewName, entry) => {
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
		this.visibilityHandler = null
		this.registryUnsubscribe?.()
		this.registryUnsubscribe = null
		this.started = false
	}

	reconcileNow(): void {
		this.reconcile()
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
	reject?: (error: Error) => void
}

interface SyncRound {
	requestId: string
	generation: number
	createdAt: number
	expectedPeerIds: Set<string>
	readyResponderIds: Set<string>
	initializingResponders: Map<string, { instanceId: string; empty: boolean }>
}

const MAX_SYNC_CORRELATIONS = 16
const SYNC_RETRY_BASE_MS = 50
const SYNC_RETRY_MAX_MS = 1000

class Coordinator<S extends object> {
	private readonly namespace: string
	private channel: Channel
	private registry: Registry
	private presence!: Presence
	private leader!: Leader
	private state!: State<S>
	private views!: Views
	private domainsAttached = false

	private tabId: string
	private readonly instanceId: string
	private readonly startedAt: number
	private epoch: string
	private options: Required<WorkspaceOptions>
	private lifecycle: WorkspaceLifecycle = 'initializing'
	private sync: WorkspaceSyncState = 'pending'
	private missingPeerIds = new Set<string>()
	private queue: QueuedCall[] = []
	private readyResolve!: () => void
	private readyReject!: (error: Error) => void
	private readySettled = false
	readonly readyPromise: Promise<void>
	private initAbort: AbortController | null = null
	private identityClaims = new Map<string, number>()
	private identityRepairRequested = false
	private identityRepairing = false
	private resourceCleanups = new Set<() => void>()
	private syncGeneration = 0
	private syncRounds = new Map<string, SyncRound>()
	private activeSyncRound: SyncRound | null = null
	private syncProgressWaiters = new Set<() => void>()
	private syncRetryTimer: ReturnType<typeof setTimeout> | null = null
	private syncRetryDelay = SYNC_RETRY_BASE_MS

	// event system
	private eventListeners = new Map<string, Set<(payload: unknown) => void>>()

	// leader callbacks
	private leaderSetups: Array<{
		setup: () => (() => void) | undefined
		cleanup: (() => void) | undefined
		active: boolean
	}> = []

	private pagehideHandler: (event: PageTransitionEvent) => void
	private pageshowHandler: (event: PageTransitionEvent) => void

	constructor(namespace: string, opts: WorkspaceOptions) {
		this.namespace = namespace
		this.readyPromise = new Promise<void>((resolve, reject) => {
			this.readyResolve = resolve
			this.readyReject = reject
		})
		void this.readyPromise.catch(() => undefined)
		this.options = {
			heartbeat: opts.heartbeat ?? 1500,
			timeout: opts.timeout ?? 5000,
			readyTimeout: opts.readyTimeout ?? 1000,
		}

		const documentIdentity = getDocumentIdentity()
		this.instanceId = documentIdentity.instanceId
		this.startedAt = documentIdentity.startedAt
		this.tabId = getTabId()
		this.epoch = getSessionEpoch()
		this.channel = new Channel(namespace, this.tabId, this.instanceId)
		this.registry = new Registry(namespace)

		this.channel.onProtocolIncompatible((event) => this.emit('protocol:incompatible', event))
		this.channel.onMessage((msg) => this.handleIdentityMessage(msg))

		this.pagehideHandler = (event) => {
			if (event.persisted) {
				this.suspendForBfcache()
			} else {
				this.destroy()
			}
		}
		this.pageshowHandler = (event) => {
			if (event.persisted) this.resumeFromBfcache()
		}
		window.addEventListener('pagehide', this.pagehideHandler)
		window.addEventListener('pageshow', this.pageshowHandler)

		this.attachDomains()
		this.startInitialization()
	}

	private attachDomains(): void {
		this.presence = new Presence(
			this.channel,
			this.tabId,
			this.options.heartbeat,
			this.options.timeout,
			(tab) => {
				this.emit('tab:join', tab)
				this.leader.refreshProjection()
				this.handleSyncPeerJoin()
			},
			(tab) => {
				this.emit('tab:leave', tab)
				this.views.cleanupForTab(tab.id)
				this.handleSyncPeerLeave()
			},
			this.namespace,
		)

		this.leader = new Leader(
			this.namespace,
			this.channel,
			this.presence,
			(leaderId) => {
				const tab = this.presence.getTab(leaderId)
				if (!tab) return
				this.emit('leader:change', { tab, isMe: leaderId === this.tabId })
			},
			(held) => {
				if (held) this.runLeaderCallbacks()
				else this.stopLeaderCallbacks()
			},
			(error) => this.fail(error),
		)

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

		this.channel.onMessage((msg) => {
			if (msg.type === 'identity:probe' || msg.type === 'identity:claim') return
			if (msg.from.tabId === this.tabId && msg.from.instanceId !== this.instanceId) return
			if (this.lifecycle === 'bfcache-suspended' && msg.type === 'state:sync-request') return
			this.handleSyncMessage(msg)
			this.presence.handleMessage(msg)
			this.leader.handleMessage(msg)
			this.state.handleMessage(msg)
			this.views.handleMessage(msg)
			if (msg.type === 'tab:announce') this.handleSyncPeerActivity()
		})
		this.registry.startListening()
		this.domainsAttached = true
	}

	private startInitialization(): void {
		this.initAbort?.abort()
		const controller = new AbortController()
		this.initAbort = controller
		void this.initialize(controller.signal).catch((error) => {
			if (controller.signal.aborted || this.isTerminal()) return
			this.fail(error)
		})
	}

	private async initialize(signal: AbortSignal): Promise<void> {
		const deadline = Date.now() + this.options.readyTimeout
		this.resetSyncHandshake()
		this.syncGeneration++
		this.setSync('pending', [])
		await this.establishIdentity(deadline, signal)
		this.ensureRunning(signal)

		this.presence.start()
		this.leader.start()
		this.presence.discoverStoredPeers()
		const knownFromRegistry = Object.values(this.registry.list())
		const expectedTabs = new Set(knownFromRegistry.map((e) => e.tabId))
		for (const tab of this.presence.getAllTabs()) expectedTabs.add(tab.id)
		expectedTabs.delete(this.tabId)
		await this.waitForTabs(expectedTabs, this.remainingBudget(deadline, 150), signal)
		this.ensureRunning(signal)

		await this.syncState(deadline, signal)
		this.ensureRunning(signal)

		this.views.loadFromRegistry()
		this.views.validateAgainstPresence()
		this.views.start()

		this.lifecycle = 'ready'
		if (this.isSyncComplete()) {
			this.setSync('complete', [])
		} else {
			this.setSync('repairing', this.getMissingSyncPeerIds())
			this.scheduleSyncRetry()
		}
		this.flushQueue()
		if (!this.readySettled) {
			this.readySettled = true
			this.readyResolve()
		}
		this.runLeaderCallbacks()
	}

	private remainingBudget(deadline: number, stageLimit: number): number {
		return Math.max(0, Math.min(stageLimit, deadline - Date.now()))
	}

	private waitForTabs(expected: Set<string>, maxMs: number, signal: AbortSignal): Promise<void> {
		return new Promise((resolve) => {
			let settled = false
			const resources: { unsub?: () => void } = {}
			const finish = () => {
				if (settled) return
				settled = true
				clearTimeout(timeout)
				resources.unsub?.()
				signal.removeEventListener('abort', finish)
				resolve()
			}
			const timeout = setTimeout(finish, maxMs)
			signal.addEventListener('abort', finish, { once: true })
			if (expected.size === 0) {
				finish()
				return
			}
			const check = () => {
				for (const tabId of expected) {
					if (!this.presence.isAlive(tabId)) return false
				}
				return true
			}
			if (check()) {
				finish()
				return
			}
			resources.unsub = this.onInternal('tab:join', () => {
				if (check()) finish()
			})
		})
	}

	private async syncState(deadline: number, signal: AbortSignal): Promise<void> {
		if (this.currentSyncPeerIds().length === 0) return
		this.startSyncRound()
		let retryDelay = SYNC_RETRY_BASE_MS
		let nextRetryAt = Date.now() + retryDelay
		while (!signal.aborted && !this.isSyncComplete()) {
			const now = Date.now()
			if (now >= deadline) return
			await this.waitForSyncProgress(Math.min(deadline, nextRetryAt) - now, signal)
			this.ensureRunning(signal)
			if (this.isSyncComplete() || Date.now() >= deadline) return
			if (Date.now() >= nextRetryAt) {
				this.startSyncRound()
				retryDelay = Math.min(retryDelay * 2, SYNC_RETRY_MAX_MS)
				nextRetryAt = Date.now() + retryDelay
			}
		}
	}

	private handleSyncMessage(msg: Message): void {
		if (msg.type === 'state:sync-request' && msg.payload !== null) {
			if (this.lifecycle === 'bfcache-suspended') return
			const request = msg.payload as StateSyncRequestPayload
			if (
				request.requesterInstanceId !== msg.from.instanceId ||
				request.protocolRevision !== msg.protocol.revision
			) {
				return
			}
			const identity = this.channel.getIdentity()
			const response: StateSyncResponsePayload = {
				requestId: request.requestId,
				requesterInstanceId: request.requesterInstanceId,
				requesterGeneration: request.requesterGeneration,
				responderId: identity.tabId,
				responderInstanceId: identity.instanceId,
				responderState: this.lifecycle === 'ready' ? 'ready' : 'initializing',
				complete: true,
				state: this.state.getSnapshot(),
			}
			this.channel.send('state:sync', response, msg.from)
			return
		}
		if (
			msg.type !== 'state:sync' ||
			typeof msg.payload !== 'object' ||
			msg.payload === null ||
			!('requestId' in msg.payload)
		) {
			return
		}
		this.handleSyncResponse(msg, msg.payload as unknown as StateSyncResponsePayload)
	}

	private handleSyncResponse(msg: Message, response: StateSyncResponsePayload): void {
		if (
			response.requesterInstanceId !== this.instanceId ||
			response.requesterGeneration !== this.syncGeneration ||
			response.responderId !== msg.from.tabId ||
			response.responderInstanceId !== msg.from.instanceId
		) {
			return
		}
		const round = this.syncRounds.get(response.requestId)
		if (!round || round.generation !== this.syncGeneration) return

		this.state.mergeSyncMessage(msg)
		if (round.expectedPeerIds.has(response.responderId)) {
			if (response.responderState === 'ready') {
				round.readyResponderIds.add(response.responderId)
				round.initializingResponders.delete(response.responderId)
			} else {
				round.initializingResponders.set(response.responderId, {
					instanceId: response.responderInstanceId,
					empty: Object.keys(response.state).length === 0,
				})
			}
		}
		this.notifySyncProgress()
		this.updateReadySyncStatus()
	}

	private startSyncRound(): void {
		const expectedPeerIds = new Set(this.currentSyncPeerIds())
		if (expectedPeerIds.size === 0) {
			this.notifySyncProgress()
			return
		}
		const requestId = crypto.randomUUID()
		const round: SyncRound = {
			requestId,
			generation: this.syncGeneration,
			createdAt: Date.now(),
			expectedPeerIds,
			readyResponderIds: new Set(),
			initializingResponders: new Map(),
		}
		this.syncRounds.set(requestId, round)
		this.activeSyncRound = round
		while (this.syncRounds.size > MAX_SYNC_CORRELATIONS) {
			const oldest = this.syncRounds.keys().next().value
			if (oldest === undefined) break
			this.syncRounds.delete(oldest)
		}
		this.state.requestSync({
			requestId,
			requesterInstanceId: this.instanceId,
			requesterGeneration: this.syncGeneration,
			knownPeers: [...expectedPeerIds].sort(),
			protocolRevision: LOCAL_PROTOCOL.revision,
		})
	}

	private currentSyncPeerIds(): string[] {
		return this.presence
			.getAllTabs()
			.map((tab) => tab.id)
			.filter((tabId) => tabId !== this.tabId)
			.sort()
	}

	private isSyncComplete(): boolean {
		const livePeerIds = this.currentSyncPeerIds()
		if (livePeerIds.length === 0) return true
		for (const round of [...this.syncRounds.values()].reverse()) {
			if (this.isSyncRoundComplete(round, livePeerIds)) return true
		}
		return false
	}

	private isSyncRoundComplete(round: SyncRound, livePeerIds: string[]): boolean {
		if (round.generation !== this.syncGeneration) return false
		if (livePeerIds.some((tabId) => !round.expectedPeerIds.has(tabId))) return false
		if (livePeerIds.every((tabId) => round.readyResponderIds.has(tabId))) return true
		if (Object.keys(this.state.getSnapshot()).length > 0) return false
		if (
			!livePeerIds.every((tabId) => {
				const response = round.initializingResponders.get(tabId)
				return response?.empty === true
			})
		) {
			return false
		}
		const cohortInstances = [
			this.instanceId,
			...livePeerIds.map((tabId) => round.initializingResponders.get(tabId)?.instanceId as string),
		]
		return this.instanceId === cohortInstances.sort()[0]
	}

	private getMissingSyncPeerIds(): string[] {
		if (this.isSyncComplete()) return []
		const round = this.activeSyncRound
		return this.currentSyncPeerIds().filter(
			(tabId) => !round?.expectedPeerIds.has(tabId) || !round.readyResponderIds.has(tabId),
		)
	}

	private waitForSyncProgress(maxMs: number, signal: AbortSignal): Promise<void> {
		return new Promise((resolve) => {
			let settled = false
			const finish = () => {
				if (settled) return
				settled = true
				clearTimeout(timeout)
				this.syncProgressWaiters.delete(finish)
				signal.removeEventListener('abort', finish)
				resolve()
			}
			const timeout = setTimeout(finish, Math.max(0, maxMs))
			this.syncProgressWaiters.add(finish)
			signal.addEventListener('abort', finish, { once: true })
		})
	}

	private notifySyncProgress(): void {
		for (const finish of [...this.syncProgressWaiters]) finish()
	}

	private handleSyncPeerJoin(): void {
		this.notifySyncProgress()
		if (this.lifecycle === 'ready') this.beginImmediateRepair()
	}

	private handleSyncPeerLeave(): void {
		this.notifySyncProgress()
		this.updateReadySyncStatus()
	}

	private handleSyncPeerActivity(): void {
		if (this.lifecycle !== 'ready' || this.sync !== 'repairing') return
		if (this.activeSyncRound && Date.now() - this.activeSyncRound.createdAt < SYNC_RETRY_BASE_MS) {
			return
		}
		this.beginImmediateRepair()
	}

	private beginImmediateRepair(): void {
		if (this.lifecycle !== 'ready' || this.isTerminal()) return
		this.cancelSyncRetry()
		this.syncRetryDelay = SYNC_RETRY_BASE_MS
		this.startSyncRound()
		this.updateReadySyncStatus()
	}

	private updateReadySyncStatus(): void {
		if (this.lifecycle !== 'ready' || this.isTerminal()) return
		if (this.isSyncComplete()) {
			this.cancelSyncRetry()
			this.syncRetryDelay = SYNC_RETRY_BASE_MS
			this.setSync('complete', [])
			return
		}
		this.setSync('repairing', this.getMissingSyncPeerIds())
		this.scheduleSyncRetry()
	}

	private scheduleSyncRetry(): void {
		if (
			this.syncRetryTimer ||
			this.lifecycle !== 'ready' ||
			this.sync !== 'repairing' ||
			this.isTerminal()
		) {
			return
		}
		const delay = this.syncRetryDelay
		this.syncRetryTimer = setTimeout(() => {
			this.syncRetryTimer = null
			if (this.lifecycle !== 'ready' || this.sync !== 'repairing' || this.isTerminal()) return
			this.startSyncRound()
			this.syncRetryDelay = Math.min(this.syncRetryDelay * 2, SYNC_RETRY_MAX_MS)
			this.updateReadySyncStatus()
		}, delay)
	}

	private cancelSyncRetry(): void {
		if (this.syncRetryTimer) clearTimeout(this.syncRetryTimer)
		this.syncRetryTimer = null
	}

	private resetSyncHandshake(): void {
		this.cancelSyncRetry()
		this.notifySyncProgress()
		this.syncRounds.clear()
		this.activeSyncRound = null
		this.syncRetryDelay = SYNC_RETRY_BASE_MS
	}

	private async establishIdentity(deadline: number, signal: AbortSignal): Promise<void> {
		while (!signal.aborted) {
			this.identityClaims.clear()
			this.channel.send('identity:probe', { startedAt: this.startedAt })
			await this.waitForIdentityClaims(this.remainingBudget(deadline, 75), signal)
			this.ensureRunning(signal)
			if (!this.hasEarlierIdentityClaim()) return
			this.applyFreshTabId()
			if (Date.now() >= deadline) return
		}
	}

	private waitForIdentityClaims(maxMs: number, signal: AbortSignal): Promise<void> {
		return new Promise((resolve) => {
			let settled = false
			const finish = () => {
				if (settled) return
				settled = true
				clearTimeout(timeout)
				signal.removeEventListener('abort', finish)
				resolve()
			}
			const timeout = setTimeout(finish, maxMs)
			signal.addEventListener('abort', finish, { once: true })
		})
	}

	private handleIdentityMessage(msg: Message): void {
		if (msg.type !== 'identity:probe' && msg.type !== 'identity:claim') return
		if (msg.from.tabId !== this.tabId || msg.from.instanceId === this.instanceId) return
		const { startedAt } = msg.payload as { startedAt: number }
		this.identityClaims.set(msg.from.instanceId, startedAt)
		if (msg.type === 'identity:probe') {
			this.channel.send('identity:claim', { startedAt: this.startedAt }, msg.from)
		}
		if (this.isEarlierClaim(startedAt, msg.from.instanceId)) {
			this.identityRepairRequested = true
			if (this.lifecycle === 'ready') this.scheduleIdentityRepair()
		}
	}

	private hasEarlierIdentityClaim(): boolean {
		for (const [instanceId, startedAt] of this.identityClaims) {
			if (this.isEarlierClaim(startedAt, instanceId)) return true
		}
		return false
	}

	private isEarlierClaim(startedAt: number, instanceId: string): boolean {
		return (
			startedAt < this.startedAt || (startedAt === this.startedAt && instanceId < this.instanceId)
		)
	}

	private applyFreshTabId(): void {
		const nextTabId = crypto.randomUUID()
		replaceTabId(nextTabId)
		this.tabId = nextTabId
		this.channel.replaceTabId(nextTabId)
		if (this.domainsAttached) {
			this.presence.reidentify(nextTabId)
			this.state.reidentify(nextTabId)
			this.leader.reset()
		}
		this.identityRepairRequested = false
	}

	private scheduleIdentityRepair(): void {
		if (this.identityRepairing || this.isTerminal()) return
		this.identityRepairing = true
		queueMicrotask(() => {
			void this.repairIdentity()
				.catch((error) => this.fail(error))
				.finally(() => {
					this.identityRepairing = false
				})
		})
	}

	private async repairIdentity(): Promise<void> {
		if (!this.identityRepairRequested || this.isTerminal()) return
		this.lifecycle = 'initializing'
		this.stopLeaderCallbacks()
		this.leader.stop()
		const self = this.presence.getSelf()
		if (self.view) this.views.release(self.view)
		this.presence.broadcastLeave()
		this.presence.stop()
		this.views.stop()
		this.applyFreshTabId()
		this.startInitialization()
	}

	private suspendForBfcache(): void {
		if (this.isTerminal() || this.lifecycle === 'bfcache-suspended') return
		this.initAbort?.abort()
		this.resetSyncHandshake()
		this.lifecycle = 'bfcache-suspended'
		this.setSync('pending', [])
		this.stopLeaderCallbacks()
		if (this.domainsAttached) {
			this.leader.stop()
			this.presence.stop()
			this.views.stop()
		}
	}

	private resumeFromBfcache(): void {
		if (this.lifecycle !== 'bfcache-suspended') return
		this.lifecycle = 'initializing'
		this.startInitialization()
	}

	private setSync(sync: WorkspaceSyncState, missingPeerIds: string[]): void {
		const nextMissing = new Set(missingPeerIds)
		const changed =
			this.sync !== sync ||
			nextMissing.size !== this.missingPeerIds.size ||
			[...nextMissing].some((id) => !this.missingPeerIds.has(id))
		this.sync = sync
		this.missingPeerIds = nextMissing
		if (changed) this.emit('sync:status', this.status())
	}

	status(): WorkspaceStatus {
		return Object.freeze({
			lifecycle: this.lifecycle,
			sync: this.sync,
			missingPeerIds: Object.freeze([...this.missingPeerIds].sort()),
		})
	}

	private ensureRunning(signal: AbortSignal): void {
		if (signal.aborted || this.isTerminal() || this.lifecycle === 'bfcache-suspended') {
			throw new DOMException('Tabula initialization was aborted.', 'AbortError')
		}
	}

	private isTerminal(): boolean {
		return this.lifecycle === 'failed' || this.lifecycle === 'destroyed'
	}

	assertActive(): void {
		if (this.lifecycle === 'destroyed') throw new WorkspaceDestroyedError()
		if (this.lifecycle === 'failed') throw new WorkspaceFailedError()
	}

	private fail(cause: unknown): void {
		if (this.isTerminal()) return
		this.lifecycle = 'failed'
		const error = new WorkspaceFailedError(cause)
		if (!this.readySettled) {
			this.readySettled = true
			this.readyReject(error)
		}
		this.cleanupTerminal(error)
	}

	// ── Event system ──

	private emit(event: string, payload: unknown): void {
		if (this.isTerminal()) return
		const listeners = this.eventListeners.get(event)
		if (!listeners) return
		for (const cb of listeners) cb(payload)
	}

	on(event: string, cb: (payload: unknown) => void): () => void {
		this.assertActive()
		return this.onInternal(event, cb)
	}

	private onInternal(event: string, cb: (payload: unknown) => void): () => void {
		let set = this.eventListeners.get(event)
		if (!set) {
			set = new Set()
			this.eventListeners.set(event, set)
		}
		set.add(cb)
		return () => set.delete(cb)
	}

	off(event: string, cb: (payload: unknown) => void): void {
		this.assertActive()
		this.eventListeners.get(event)?.delete(cb)
	}

	// ── Leader callbacks ──

	addLeaderSetup(setup: () => (() => void) | undefined): () => void {
		this.assertActive()
		const entry = { setup, cleanup: undefined as (() => void) | undefined, active: false }
		this.leaderSetups.push(entry)

		// if already leader, run immediately
		if (this.lifecycle === 'ready' && this.leader.isLeader()) {
			this.activateLeaderSetup(entry)
		}

		return () => {
			this.deactivateLeaderSetup(entry)
			const idx = this.leaderSetups.indexOf(entry)
			if (idx >= 0) this.leaderSetups.splice(idx, 1)
		}
	}

	private runLeaderCallbacks(): void {
		if (this.lifecycle !== 'ready') return
		for (const entry of this.leaderSetups) {
			if (this.leader.isLeader()) {
				this.activateLeaderSetup(entry)
			} else {
				this.deactivateLeaderSetup(entry)
			}
		}
	}

	private stopLeaderCallbacks(): void {
		for (const entry of this.leaderSetups) this.deactivateLeaderSetup(entry)
	}

	private activateLeaderSetup(entry: (typeof this.leaderSetups)[number]): void {
		if (entry.active) return
		entry.active = true
		try {
			entry.cleanup = entry.setup() ?? undefined
		} catch (error) {
			console.error('Tabula onLeader setup threw an error.', error)
		}
	}

	private deactivateLeaderSetup(entry: (typeof this.leaderSetups)[number]): void {
		if (!entry.active) return
		entry.active = false
		const cleanup = entry.cleanup
		entry.cleanup = undefined
		try {
			cleanup?.()
		} catch (error) {
			console.error('Tabula onLeader cleanup threw an error.', error)
		}
	}

	// ── Queue ──

	private flushQueue(): void {
		for (const item of this.queue) item.fn()
		this.queue = []
	}

	enqueue(fn: () => void): void {
		this.assertActive()
		if (this.lifecycle === 'ready') {
			fn()
		} else {
			this.queue.push({ fn })
		}
	}

	runWhenReady<T>(fn: () => Promise<T> | T): Promise<T> {
		this.assertActive()
		if (this.lifecycle === 'ready') return Promise.resolve().then(fn)
		return new Promise<T>((resolve, reject) => {
			this.queue.push({
				fn: () => {
					void Promise.resolve().then(fn).then(resolve, reject)
				},
				reject,
			})
		})
	}

	trackResource(cleanup: () => void): () => void {
		this.assertActive()
		this.resourceCleanups.add(cleanup)
		return () => this.resourceCleanups.delete(cleanup)
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
		return this.lifecycle === 'ready'
	}

	destroy(): void {
		if (this.lifecycle === 'destroyed' || this.lifecycle === 'failed') return
		this.lifecycle = 'destroyed'
		const error = new WorkspaceDestroyedError()
		if (!this.readySettled) {
			this.readySettled = true
			this.readyReject(error)
		}
		this.cleanupTerminal(error)
	}

	private cleanupTerminal(error: Error): void {
		this.initAbort?.abort()
		this.initAbort = null
		this.resetSyncHandshake()
		this.stopLeaderCallbacks()
		this.leader.stop()
		this.leaderSetups = []
		if (this.domainsAttached) {
			try {
				const self = this.presence.getSelf()
				if (self.view) this.views.release(self.view)
				this.presence.broadcastLeave()
			} catch {
				// Terminal cleanup is best effort after a storage/runtime failure.
			}
			this.presence.stop()
			this.views.stop()
			this.state.stop()
		}
		this.registry.stopListening()
		for (const cleanup of this.resourceCleanups) cleanup()
		this.resourceCleanups.clear()
		for (const item of this.queue) item.reject?.(error)
		this.queue = []
		this.channel.close()
		window.removeEventListener('pagehide', this.pagehideHandler)
		window.removeEventListener('pageshow', this.pageshowHandler)
		this.eventListeners.clear()
	}
}

// ── Layer 4: Public API ───────────────────────────────────────────────────

export function createWorkspace<S extends object = Record<string, unknown>>(
	namespace: string,
	options: WorkspaceOptions = {},
): Workspace<S> {
	if (!isValidName(namespace)) {
		throw new Error(
			'createWorkspace() requires a non-empty namespace of at most 128 UTF-8 bytes. ' +
				"This identifies your workspace across tabs — e.g. createWorkspace('my-app').",
		)
	}
	for (const [name, value] of [
		['heartbeat', options.heartbeat],
		['timeout', options.timeout],
		['readyTimeout', options.readyTimeout],
	] as const) {
		if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
			throw new TypeError(`createWorkspace() option ${name} must be a positive finite number.`)
		}
	}
	assertBaselineCapabilities()

	const coord = new Coordinator<S>(namespace, options)

	const stateApi: WorkspaceState<S> = {
		set(key, value) {
			coord.enqueue(() => coord.getState().set(key, value))
		},
		get(key) {
			coord.assertActive()
			return coord.getState().get(key)
		},
		on(key: string, cb: (...args: unknown[]) => void) {
			coord.assertActive()
			if (key === '*') {
				return coord.getState().onWildcard(cb as (key: string, value: unknown) => void)
			}
			return coord.getState().onKey(key as keyof S & string, cb as (value: unknown) => void)
		},
		delete(key) {
			coord.enqueue(() => coord.getState().delete(key))
		},
		keys() {
			coord.assertActive()
			return coord.getState().keys() as any
		},
		entries() {
			coord.assertActive()
			return coord.getState().allEntries() as any
		},
		setAll(entries) {
			coord.enqueue(() => coord.getState().setAll(entries as any))
		},
	} as WorkspaceState<S>

	const viewsApi: WorkspaceViews = {
		get: (name) => {
			coord.assertActive()
			return coord.getViews().get(name)
		},
		list: () => {
			coord.assertActive()
			return coord.getViews().listAll()
		},
		has: (name) => {
			coord.assertActive()
			return coord.getViews().has(name)
		},
	}

	const tabsApi: WorkspaceTabs = {
		list: () => {
			coord.assertActive()
			return coord.getPresence().getAllTabs()
		},
		current: () => {
			coord.assertActive()
			return coord.getPresence().getSelf()
		},
		leader: () => {
			coord.assertActive()
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
		status: () => coord.status(),

		claim(viewName: string) {
			coord.assertActive()
			const currentView = coord.getPresence().getSelf().view
			if (currentView) {
				throw new Error(
					`app.claim('${viewName}') was called, but this tab already holds the '${currentView}' view. A tab can hold only one view at a time.`,
				)
			}
			coord.enqueue(() => {
				// Check for pending-open data written by the opener tab.
				// Key is per-view so two concurrent open() calls for different views
				// never overwrite each other's data.
				const pendingKey = `tabula:${namespace}:pending-open:${viewName}`
				const raw = storageGet(localStorage, 'localStorage', pendingKey)
				if (raw) {
					try {
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
					} catch {
						console.warn('Tabula removed a corrupt pending-open projection from localStorage.')
					}
					storageRemove(localStorage, 'localStorage', pendingKey)
				}
				coord.getViews().claim(viewName)
			})
		},

		open(viewName: string, opts: ViewOpenOptions<S>): Promise<ViewHandle> {
			return coord.runWhenReady(async () => {
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
				// Key is per-view so two concurrent open() calls for different views
				// never overwrite each other's data.
				const pendingKey = `tabula:${namespace}:pending-open:${viewName}`
				const pendingData: Record<string, unknown> = { view: viewName }
				if (opts.syncKeys) {
					pendingData.syncedState = coord.getState().getKeysForSync(opts.syncKeys)
				}
				storageSet(localStorage, 'localStorage', pendingKey, JSON.stringify(pendingData))

				const opened = window.open(new URL(opts.url, window.location.href).toString())
				if (!opened) {
					storageRemove(localStorage, 'localStorage', pendingKey)
					throw new Error(
						`Failed to open tab for view '${viewName}'. The browser may have blocked the popup. app.open() must be called in direct response to a user gesture (click, keyboard).`,
					)
				}

				// wait for the new tab to claim the view
				const claimed = await new Promise<boolean>((resolve) => {
					let settled = false
					const resources: { timeout?: ReturnType<typeof setTimeout> } = {}
					let unsub: () => void = () => undefined
					let untrack: () => void = () => undefined
					const finish = (result: boolean) => {
						if (settled) return
						settled = true
						if (resources.timeout) clearTimeout(resources.timeout)
						unsub()
						untrack()
						if (!result) {
							try {
								storageRemove(localStorage, 'localStorage', pendingKey)
							} catch {
								// The terminal or timeout error remains primary.
							}
						}
						resolve(result)
					}
					resources.timeout = setTimeout(() => finish(false), 5000)
					unsub = coord.on('view:claimed', (payload: unknown) => {
						const e = payload as ViewClaimedEvent
						if (e.name === viewName) {
							finish(true)
						}
					})
					untrack = coord.trackResource(() => finish(false))
				})

				if (!claimed) {
					coord.assertActive()
					throw new Error(
						`View '${viewName}' was not claimed by the new tab within 5 seconds. Make sure the opened page calls app.claim('${viewName}').`,
					)
				}

				// return handle
				const handleListeners = new Map<string, Set<(...args: unknown[]) => void>>()

				const handle: ViewHandle = {
					on(event: string, cb: (...args: unknown[]) => void) {
						coord.assertActive()
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
						coord.enqueue(() => coord.getViews().release(viewName))
					},
					focus() {
						coord.enqueue(() => coord.getViews().focus(viewName))
					},
				} as ViewHandle

				return handle
			})
		},

		focus(viewName: string) {
			coord.enqueue(() => coord.getViews().focus(viewName))
		},

		destroy() {
			coord.destroy()
		},

		onLeader(setup) {
			return coord.addLeaderSetup(setup)
		},

		isLeader() {
			coord.assertActive()
			return coord.isReady() && coord.getLeader().isLeader()
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
