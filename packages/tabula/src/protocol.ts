export const PROTOCOL_MAJOR = 1 as const
export const PROTOCOL_REVISION = 1 as const
export const PROTOCOL_MIN_REVISION = 0 as const

export const MAX_MESSAGE_BYTES = 1024 * 1024
export const MAX_STRUCTURE_DEPTH = 64
export const MAX_STRUCTURE_NODES = 10_000
export const MAX_STATE_KEYS = 1024
export const MAX_PRESENCE_PEERS = 256
export const MAX_NAME_BYTES = 128
export const MAX_ID_BYTES = 256

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const textEncoder = new TextEncoder()

export type MessageType =
	| 'identity:probe'
	| 'identity:claim'
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
	| 'protocol:reject'

const MESSAGE_TYPES = new Set<MessageType>([
	'identity:probe',
	'identity:claim',
	'tab:announce',
	'tab:heartbeat',
	'tab:leave',
	'state:sync-request',
	'state:sync',
	'state:set',
	'state:delete',
	'view:claim',
	'view:claimed',
	'view:release',
	'view:conflict',
	'view:focus',
	'leader:change',
	'protocol:reject',
])

export interface ProtocolVersion {
	major: number
	revision: number
	minRevision: number
}

export interface MessageIdentity {
	tabId: string
	instanceId: string
}

export interface MessageTarget {
	tabId: string
	instanceId?: string
}

export interface Message<T = unknown> {
	protocol: ProtocolVersion
	type: MessageType
	id: string
	from: MessageIdentity
	to?: MessageTarget
	sentAt: number
	payload: T
}

export interface ProtocolIncompatibleEvent {
	peer: MessageIdentity
	local: ProtocolVersion
	remote: ProtocolVersion
	recovery: 'Save work and reload all application tabs.'
}

export type InboundResult =
	| { kind: 'valid'; message: Message }
	| { kind: 'unknown'; type: string }
	| {
			kind: 'incompatible'
			peer: MessageIdentity
			remote: ProtocolVersion
			to?: MessageTarget
			type: string
	  }
	| { kind: 'invalid' }

export const LOCAL_PROTOCOL: ProtocolVersion = Object.freeze({
	major: PROTOCOL_MAJOR,
	revision: PROTOCOL_REVISION,
	minRevision: PROTOCOL_MIN_REVISION,
})

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function hasSafeOwnKeys(value: Record<string, unknown>): boolean {
	return Object.keys(value).every((key) => !DANGEROUS_KEYS.has(key))
}

function byteLength(value: string): number {
	return textEncoder.encode(value).byteLength
}

export function isValidId(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		byteLength(value) <= MAX_ID_BYTES &&
		!/\p{Cc}/u.test(value)
	)
}

export function isValidName(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		byteLength(value) <= MAX_NAME_BYTES &&
		!/\p{Cc}/u.test(value) &&
		!DANGEROUS_KEYS.has(value)
	)
}

function parseVersion(value: unknown): ProtocolVersion | null {
	if (!isRecord(value) || !hasSafeOwnKeys(value)) return null
	const { major, revision } = value
	const minRevision = value.minRevision ?? 0
	if (
		!Number.isSafeInteger(major) ||
		!Number.isSafeInteger(revision) ||
		!Number.isSafeInteger(minRevision) ||
		(major as number) < 0 ||
		(revision as number) < 0 ||
		(minRevision as number) < 0 ||
		(minRevision as number) > (revision as number)
	) {
		return null
	}
	return {
		major: major as number,
		revision: revision as number,
		minRevision: minRevision as number,
	}
}

function parseIdentity(value: unknown): MessageIdentity | null {
	if (!isRecord(value) || !hasSafeOwnKeys(value)) return null
	if (!isValidId(value.tabId) || !isValidId(value.instanceId)) return null
	return { tabId: value.tabId, instanceId: value.instanceId }
}

function parseTarget(value: unknown): MessageTarget | null {
	if (!isRecord(value) || !hasSafeOwnKeys(value) || !isValidId(value.tabId)) return null
	if (value.instanceId !== undefined && !isValidId(value.instanceId)) return null
	return value.instanceId === undefined
		? { tabId: value.tabId }
		: { tabId: value.tabId, instanceId: value.instanceId }
}

export function protocolRangesOverlap(remote: ProtocolVersion): boolean {
	return (
		remote.major === LOCAL_PROTOCOL.major &&
		remote.minRevision <= LOCAL_PROTOCOL.revision &&
		LOCAL_PROTOCOL.minRevision <= remote.revision
	)
}

function structuralBudgetIsValid(root: unknown): boolean {
	let bytes = 0
	let nodes = 0
	const seen = new Set<object>()
	const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]

	while (pending.length > 0) {
		const current = pending.pop() as { value: unknown; depth: number }
		const { value, depth } = current
		if (depth > MAX_STRUCTURE_DEPTH || ++nodes > MAX_STRUCTURE_NODES) return false

		if (typeof value === 'string') {
			bytes += byteLength(value)
		} else if (
			typeof value === 'number' ||
			typeof value === 'boolean' ||
			typeof value === 'bigint' ||
			value === null ||
			value === undefined
		) {
			bytes += 8
		} else if (typeof value === 'symbol' || typeof value === 'function') {
			return false
		} else if (typeof value === 'object') {
			if (seen.has(value)) continue
			seen.add(value)
			if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)
				return false
			if (value instanceof ArrayBuffer) {
				bytes += value.byteLength
			} else if (ArrayBuffer.isView(value)) {
				bytes += value.byteLength
			} else if (value instanceof Date) {
				if (!Number.isFinite(value.getTime())) return false
				bytes += 8
			} else if (value instanceof RegExp) {
				bytes += byteLength(value.source) + byteLength(value.flags)
			} else if (typeof Blob !== 'undefined' && value instanceof Blob) {
				bytes += value.size
			} else if (value instanceof Map) {
				for (const [key, entry] of value) {
					if (typeof key === 'string' && DANGEROUS_KEYS.has(key)) return false
					pending.push({ value: key, depth: depth + 1 }, { value: entry, depth: depth + 1 })
				}
			} else if (value instanceof Set || Array.isArray(value)) {
				for (const entry of value) pending.push({ value: entry, depth: depth + 1 })
			} else {
				let keys: string[]
				try {
					keys = Object.keys(value)
				} catch {
					return false
				}
				for (const key of keys) {
					if (DANGEROUS_KEYS.has(key)) return false
					bytes += byteLength(key)
					try {
						pending.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 })
					} catch {
						return false
					}
				}
			}
		}

		if (bytes > MAX_MESSAGE_BYTES) return false
	}

	return true
}

export function isValidStateKey(value: unknown): value is string {
	return isValidId(value) && !DANGEROUS_KEYS.has(value)
}

function isStateEntry(value: unknown): boolean {
	return (
		isRecord(value) &&
		hasSafeOwnKeys(value) &&
		'value' in value &&
		value.value !== undefined &&
		isFiniteTimestamp(value.ts) &&
		isValidId(value.tabId) &&
		Number.isSafeInteger(value.version) &&
		(value.version as number) >= 0 &&
		structuralBudgetIsValid(value.value)
	)
}

function isStateRecord(value: unknown): boolean {
	if (!isRecord(value) || !hasSafeOwnKeys(value)) return false
	const entries = Object.entries(value)
	return (
		entries.length <= MAX_STATE_KEYS &&
		entries.every(([key, entry]) => isValidStateKey(key) && isStateEntry(entry))
	)
}

function hasName(value: unknown): boolean {
	return isRecord(value) && hasSafeOwnKeys(value) && isValidName(value.name)
}

function validatePayload(type: MessageType, payload: unknown): boolean {
	switch (type) {
		case 'identity:probe':
		case 'identity:claim':
			return isRecord(payload) && hasSafeOwnKeys(payload) && isFiniteTimestamp(payload.startedAt)
		case 'tab:announce':
			return (
				isRecord(payload) &&
				hasSafeOwnKeys(payload) &&
				typeof payload.visible === 'boolean' &&
				(payload.view === null || isValidName(payload.view)) &&
				isFiniteTimestamp(payload.createdAt)
			)
		case 'tab:heartbeat':
		case 'tab:leave':
			return payload === null
		case 'state:set':
			return (
				isRecord(payload) &&
				hasSafeOwnKeys(payload) &&
				isValidStateKey(payload.key) &&
				isStateEntry(payload.entry)
			)
		case 'state:delete':
			return isRecord(payload) && hasSafeOwnKeys(payload) && isValidStateKey(payload.key)
		case 'state:sync-request':
			return (
				payload === null ||
				(isRecord(payload) &&
					hasSafeOwnKeys(payload) &&
					isValidId(payload.requestId) &&
					Array.isArray(payload.knownPeers) &&
					payload.knownPeers.length <= 256 &&
					payload.knownPeers.every(isValidId) &&
					Number.isSafeInteger(payload.protocolRevision) &&
					(payload.protocolRevision as number) >= 0)
			)
		case 'state:sync':
			return isRecord(payload) && hasSafeOwnKeys(payload) && isStateRecord(payload.state)
		case 'view:claim':
		case 'view:release':
		case 'view:focus':
			return hasName(payload)
		case 'view:claimed':
			return isRecord(payload) && hasName(payload) && isValidId(payload.tabId)
		case 'view:conflict':
			return (
				isRecord(payload) &&
				hasName(payload) &&
				isValidId(payload.existingTabId) &&
				isValidId(payload.incomingTabId)
			)
		case 'leader:change':
			return isRecord(payload) && hasSafeOwnKeys(payload) && isValidId(payload.tabId)
		case 'protocol:reject':
			return (
				isRecord(payload) &&
				hasSafeOwnKeys(payload) &&
				parseVersion(payload.local) !== null &&
				parseVersion(payload.remote) !== null &&
				payload.recovery === 'Save work and reload all application tabs.'
			)
	}
}

export function validateInboundMessage(data: unknown): InboundResult {
	try {
		if (!isRecord(data) || !hasSafeOwnKeys(data) || !structuralBudgetIsValid(data)) {
			return { kind: 'invalid' }
		}
		const protocol = parseVersion(data.protocol)
		const from = parseIdentity(data.from)
		const to = data.to === undefined ? undefined : parseTarget(data.to)
		if (
			!protocol ||
			!from ||
			(data.to !== undefined && !to) ||
			!isValidId(data.id) ||
			typeof data.type !== 'string' ||
			!isFiniteTimestamp(data.sentAt) ||
			!Object.hasOwn(data, 'payload')
		) {
			return { kind: 'invalid' }
		}
		if (!protocolRangesOverlap(protocol)) {
			return {
				kind: 'incompatible',
				peer: from,
				remote: protocol,
				...(to ? { to } : {}),
				type: data.type,
			}
		}
		if (!MESSAGE_TYPES.has(data.type as MessageType)) return { kind: 'unknown', type: data.type }
		const type = data.type as MessageType
		if (!validatePayload(type, data.payload)) return { kind: 'invalid' }
		return {
			kind: 'valid',
			message: {
				protocol,
				type,
				id: data.id,
				from,
				...(to ? { to } : {}),
				sentAt: data.sentAt,
				payload: data.payload,
			},
		}
	} catch {
		return { kind: 'invalid' }
	}
}

export interface StoredPresence {
	lastSeen: number
	createdAt: number
	visible: boolean
	view: string | null
}

export function validateStoredPresence(value: unknown): StoredPresence | null {
	if (
		!isRecord(value) ||
		!hasSafeOwnKeys(value) ||
		!isFiniteTimestamp(value.lastSeen) ||
		!isFiniteTimestamp(value.createdAt) ||
		typeof value.visible !== 'boolean' ||
		!(value.view === null || isValidName(value.view))
	) {
		return null
	}
	return {
		lastSeen: value.lastSeen,
		createdAt: value.createdAt,
		visible: value.visible,
		view: value.view,
	}
}

export interface StoredViewRegistryEntry {
	tabId: string
	claimedAt: number
	epoch: string
	meta: Record<string, unknown>
}

export function validateStoredViewRegistryEntry(value: unknown): StoredViewRegistryEntry | null {
	if (
		!isRecord(value) ||
		!hasSafeOwnKeys(value) ||
		!isValidId(value.tabId) ||
		!isFiniteTimestamp(value.claimedAt) ||
		!isValidId(value.epoch) ||
		!isRecord(value.meta) ||
		!hasSafeOwnKeys(value.meta) ||
		!structuralBudgetIsValid(value.meta)
	) {
		return null
	}
	return {
		tabId: value.tabId,
		claimedAt: value.claimedAt,
		epoch: value.epoch,
		meta: Object.assign(Object.create(null) as Record<string, unknown>, value.meta),
	}
}
