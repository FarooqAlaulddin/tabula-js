export type WorkspaceLifecycle =
	| 'initializing'
	| 'ready'
	| 'bfcache-suspended'
	| 'failed'
	| 'destroyed'

export type WorkspaceSyncState = 'pending' | 'repairing' | 'complete'

export interface WorkspaceStatus {
	readonly lifecycle: WorkspaceLifecycle
	readonly sync: WorkspaceSyncState
	readonly missingPeerIds: readonly string[]
}

export class CapabilityError extends Error {
	readonly capability: string

	constructor(capability: string, detail: string) {
		super(`Tabula requires ${capability}. ${detail}`)
		this.name = 'CapabilityError'
		this.capability = capability
	}
}

export class StorageOperationError extends Error {
	readonly storage: 'localStorage' | 'sessionStorage'
	readonly operation: 'read' | 'write' | 'remove'

	constructor(
		storage: 'localStorage' | 'sessionStorage',
		operation: 'read' | 'write' | 'remove',
		cause?: unknown,
	) {
		super(`Tabula could not ${operation} ${storage}; the operation was not committed.`, { cause })
		this.name = 'StorageOperationError'
		this.storage = storage
		this.operation = operation
	}
}

export class StorageCorruptionError extends Error {
	constructor(record: string) {
		super(`Tabula found a corrupt authoritative storage record for ${record}.`)
		this.name = 'StorageCorruptionError'
	}
}

export class WorkspaceDestroyedError extends Error {
	constructor() {
		super('This Tabula workspace has been destroyed.')
		this.name = 'WorkspaceDestroyedError'
	}
}

export class WorkspaceFailedError extends Error {
	constructor(cause?: unknown) {
		super('This Tabula workspace failed because coordination could not continue.', { cause })
		this.name = 'WorkspaceFailedError'
	}
}

interface DocumentIdentity {
	instanceId: string
	startedAt: number
}

let documentIdentity: DocumentIdentity | undefined
let documentMessageCounter = 0

export function getDocumentIdentity(): DocumentIdentity {
	if (!documentIdentity) {
		documentIdentity = {
			instanceId: crypto.randomUUID(),
			startedAt: Date.now(),
		}
	}
	return documentIdentity
}

export function nextMessageId(instanceId: string): string {
	return `${instanceId}:${++documentMessageCounter}`
}

/** @internal Testing support for simulating separate document realms in one process. */
export function resetDocumentIdentityForTesting(): void {
	documentIdentity = undefined
	documentMessageCounter = 0
}

function requireStorage(name: 'localStorage' | 'sessionStorage'): Storage {
	try {
		const storage = globalThis[name]
		if (!storage) throw new Error(`${name} is unavailable`)
		return storage
	} catch (cause) {
		throw new CapabilityError(name, `Access is blocked or unavailable. ${String(cause)}`)
	}
}

function probeStorage(name: 'localStorage' | 'sessionStorage'): void {
	const storage = requireStorage(name)
	const key = `tabula:capability-probe:${crypto.randomUUID()}`
	const value = crypto.randomUUID()
	try {
		storage.setItem(key, value)
		if (storage.getItem(key) !== value) throw new Error('round-trip verification failed')
		storage.removeItem(key)
	} catch (cause) {
		try {
			storage.removeItem(key)
		} catch {
			// The capability error below is the actionable result.
		}
		throw new CapabilityError(
			name,
			`Read, write, and remove access must be available. ${String(cause)}`,
		)
	}
}

export function assertBaselineCapabilities(): void {
	if (typeof window === 'undefined') {
		throw new CapabilityError('a browser window', 'Server and worker runtimes are unsupported.')
	}
	if (window.self !== window.top) {
		throw new CapabilityError('a top-level browsing context', 'Iframes are unsupported.')
	}
	if (globalThis.isSecureContext !== true) {
		throw new CapabilityError('a secure context', 'Use HTTPS or a secure localhost context.')
	}
	if (typeof globalThis.crypto?.randomUUID !== 'function') {
		throw new CapabilityError('crypto.randomUUID()', 'A modern secure browser is required.')
	}
	if (typeof globalThis.structuredClone !== 'function') {
		throw new CapabilityError(
			'structuredClone()',
			'A modern browser with structured cloning is required.',
		)
	}
	if (typeof globalThis.BroadcastChannel !== 'function') {
		throw new CapabilityError(
			'BroadcastChannel',
			'For Node.js tests, use @farooqalaulddin/tabula-js/testing.',
		)
	}
	if (typeof globalThis.navigator?.locks?.request !== 'function') {
		throw new CapabilityError('Web Locks', 'navigator.locks.request() must be available.')
	}
	probeStorage('localStorage')
	probeStorage('sessionStorage')
}

export function storageGet(
	storage: Storage,
	storageName: 'localStorage' | 'sessionStorage',
	key: string,
): string | null {
	try {
		return storage.getItem(key)
	} catch (cause) {
		throw new StorageOperationError(storageName, 'read', cause)
	}
}

export function storageSet(
	storage: Storage,
	storageName: 'localStorage' | 'sessionStorage',
	key: string,
	value: string,
): void {
	try {
		storage.setItem(key, value)
	} catch (cause) {
		throw new StorageOperationError(storageName, 'write', cause)
	}
}

export function storageRemove(
	storage: Storage,
	storageName: 'localStorage' | 'sessionStorage',
	key: string,
): void {
	try {
		storage.removeItem(key)
	} catch (cause) {
		throw new StorageOperationError(storageName, 'remove', cause)
	}
}
