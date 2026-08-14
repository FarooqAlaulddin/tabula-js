import { resetDocumentIdentityForTesting } from '@tabula/runtime'
import {
	CapabilityError,
	StorageOperationError,
	WorkspaceDestroyedError,
	WorkspaceFailedError,
	createWorkspace,
} from '@tabula/tabula'
import type {
	Message,
	StateOperation,
	StateSyncRequestPayload,
	StateSyncResponsePayload,
} from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	installMockBroadcastChannel,
	installMockDocument,
	installMockStorage,
	installMockWindow,
	makeMessage,
} from './helpers'

describe('workspace lifecycle and capabilities', () => {
	let bcMock: ReturnType<typeof installMockBroadcastChannel>
	let storageMock: ReturnType<typeof installMockStorage>
	let documentMock: ReturnType<typeof installMockDocument>
	let windowMock: ReturnType<typeof installMockWindow>
	let uuidCounter = 0

	beforeEach(() => {
		vi.useFakeTimers()
		storageMock = installMockStorage()
		bcMock = installMockBroadcastChannel()
		documentMock = installMockDocument('visible')
		windowMock = installMockWindow()
		uuidCounter = 0
		vi.stubGlobal('crypto', {
			randomUUID: () => `lifecycle-uuid-${++uuidCounter}`,
		})
		resetDocumentIdentityForTesting()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
		windowMock.restore()
		documentMock.restore()
		bcMock.restore()
		storageMock.restore()
	})

	async function initialize() {
		const workspace = createWorkspace<Record<string, unknown>>('lifecycle')
		const ready = workspace.ready
		await vi.advanceTimersByTimeAsync(1000)
		await ready
		return workspace
	}

	function seedPeer(namespace: string, tabId: string): void {
		localStorage.setItem(
			`tabula:${namespace}:tab:${tabId}`,
			JSON.stringify({ lastSeen: Date.now(), createdAt: Date.now(), visible: true, view: null }),
		)
	}

	function syncRequests(namespace: string): Message<StateSyncRequestPayload>[] {
		const channel = bcMock.instances.find((instance) => instance.name === `tabula:${namespace}`)
		return (channel?.postMessage.mock.calls ?? [])
			.map((call) => call[0] as Message)
			.filter(
				(message): message is Message<StateSyncRequestPayload> =>
					message.type === 'state:sync-request' && message.payload !== null,
			)
	}

	function respondToSync(
		namespace: string,
		request: Message<StateSyncRequestPayload>,
		responderId: string,
		responderInstanceId: string,
		state: Record<string, StateOperation>,
		responderState: 'initializing' | 'ready' = 'ready',
	): void {
		const channel = bcMock.instances.find((instance) => instance.name === `tabula:${namespace}`)
		const payload: StateSyncResponsePayload = {
			requestId: request.payload.requestId,
			requesterInstanceId: request.payload.requesterInstanceId,
			requesterGeneration: request.payload.requesterGeneration,
			responderId,
			responderInstanceId,
			responderState,
			complete: true,
			state,
		}
		channel?.simulateMessage(
			makeMessage({
				type: 'state:sync',
				from: { tabId: responderId, instanceId: responderInstanceId },
				to: request.from,
				payload,
			}),
		)
	}

	it('exposes immutable initializing and ready status snapshots', async () => {
		const workspace = createWorkspace('status')
		const initial = workspace.status()
		expect(initial).toEqual({ lifecycle: 'initializing', sync: 'pending', missingPeerIds: [] })
		expect(Object.isFrozen(initial)).toBe(true)
		expect(Object.isFrozen(initial.missingPeerIds)).toBe(true)

		const syncStatuses: unknown[] = []
		workspace.on('sync:status', (status) => syncStatuses.push(status))
		await vi.advanceTimersByTimeAsync(1000)
		await workspace.ready

		expect(workspace.status()).toEqual({
			lifecycle: 'ready',
			sync: 'complete',
			missingPeerIds: [],
		})
		expect(syncStatuses).toEqual([{ lifecycle: 'ready', sync: 'complete', missingPeerIds: [] }])
		workspace.destroy()
	})

	it('uses readyTimeout as one total initialization budget', async () => {
		seedPeer('bounded-ready', 'missing-peer')
		const workspace = createWorkspace('bounded-ready', { readyTimeout: 100 })
		let settled = false
		workspace.ready.then(() => {
			settled = true
		})

		await vi.advanceTimersByTimeAsync(99)
		expect(settled).toBe(false)
		await vi.advanceTimersByTimeAsync(2)
		await workspace.ready
		expect(settled).toBe(true)
		workspace.destroy()
	})

	it('destroy before ready rejects readiness, discards queued work, and never revives', async () => {
		const workspace = createWorkspace<Record<string, unknown>>('destroy-before-ready')
		const ready = workspace.ready
		workspace.state.set('queued', true)
		workspace.destroy()
		workspace.destroy()

		await expect(ready).rejects.toBeInstanceOf(WorkspaceDestroyedError)
		await vi.advanceTimersByTimeAsync(5000)
		expect(workspace.status().lifecycle).toBe('destroyed')
		expect(bcMock.instances[0].close).toHaveBeenCalledTimes(1)
		expect(windowMock.getHandlers('pagehide')).toHaveLength(0)
		expect(windowMock.getHandlers('pageshow')).toHaveLength(0)
		expect(documentMock.getHandlers('visibilitychange')).toHaveLength(0)
	})

	it('destroy during initialization cancels active waits and resources exactly once', async () => {
		seedPeer('destroy-during-ready', 'missing-peer')
		const workspace = createWorkspace('destroy-during-ready')
		const ready = workspace.ready
		await vi.advanceTimersByTimeAsync(100)
		expect(documentMock.getHandlers('visibilitychange')).toHaveLength(1)

		workspace.destroy()
		workspace.destroy()
		await expect(ready).rejects.toBeInstanceOf(WorkspaceDestroyedError)
		await vi.advanceTimersByTimeAsync(2000)

		expect(bcMock.instances[0].close).toHaveBeenCalledTimes(1)
		expect(documentMock.getHandlers('visibilitychange')).toHaveLength(0)
		expect(workspace.status().lifecycle).toBe('destroyed')
	})

	it('merges a complete response delayed beyond the former 150ms window', async () => {
		seedPeer('delayed-sync', 'slow-peer')
		const workspace = createWorkspace<Record<string, unknown>>('delayed-sync', {
			readyTimeout: 500,
		})
		await vi.advanceTimersByTimeAsync(75)
		const request = syncRequests('delayed-sync')[0]
		expect(request).toBeDefined()

		await vi.advanceTimersByTimeAsync(200)
		let settled = false
		workspace.ready.then(() => {
			settled = true
		})
		expect(settled).toBe(false)
		respondToSync('delayed-sync', request, 'slow-peer', 'slow-instance', {
			late: {
				kind: 'set',
				key: 'late',
				value: 'arrived',
				clock: { wallTime: 10, logical: 0 },
				tabId: 'slow-peer',
				instanceId: 'slow-instance',
				operationId: 'late-operation',
			},
		})
		await workspace.ready

		expect(workspace.state.get('late')).toBe('arrived')
		expect(workspace.status().sync).toBe('complete')
		workspace.destroy()
	})

	it.each([
		['peer-a', 'peer-b'],
		['peer-b', 'peer-a'],
	] as const)('merges divergent responders in %s then %s order', async (first, second) => {
		const namespace = `multi-${first}`
		seedPeer(namespace, 'peer-a')
		seedPeer(namespace, 'peer-b')
		const workspace = createWorkspace<Record<string, unknown>>(namespace, { readyTimeout: 500 })
		await vi.advanceTimersByTimeAsync(75)
		const request = syncRequests(namespace)[0]
		const snapshots: Record<string, Record<string, StateOperation>> = {
			'peer-a': {
				a: {
					kind: 'set',
					key: 'a',
					value: 1,
					clock: { wallTime: 10, logical: 0 },
					tabId: 'peer-a',
					instanceId: 'instance-a',
					operationId: 'operation-a',
				},
				shared: {
					kind: 'set',
					key: 'shared',
					value: 'older',
					clock: { wallTime: 10, logical: 0 },
					tabId: 'peer-a',
					instanceId: 'instance-a',
					operationId: 'operation-shared-a',
				},
			},
			'peer-b': {
				b: {
					kind: 'set',
					key: 'b',
					value: 2,
					clock: { wallTime: 10, logical: 0 },
					tabId: 'peer-b',
					instanceId: 'instance-b',
					operationId: 'operation-b',
				},
				shared: {
					kind: 'set',
					key: 'shared',
					value: 'newer',
					clock: { wallTime: 11, logical: 0 },
					tabId: 'peer-b',
					instanceId: 'instance-b',
					operationId: 'operation-shared-b',
				},
			},
		}
		for (const peer of [first, second]) {
			respondToSync(namespace, request, peer, `instance-${peer.at(-1)}`, snapshots[peer])
		}
		await workspace.ready

		expect(workspace.state.get('a')).toBe(1)
		expect(workspace.state.get('b')).toBe(2)
		expect(workspace.state.get('shared')).toBe('newer')
		expect(new Set(workspace.state.keys())).toEqual(new Set(['a', 'b', 'shared']))
		expect(workspace.status().sync).toBe('complete')
		workspace.destroy()
	})

	it('repairs values and tombstones from a retained late response after ready', async () => {
		seedPeer('late-repair', 'frozen-peer')
		const workspace = createWorkspace<Record<string, unknown>>('late-repair', {
			readyTimeout: 150,
		})
		const statuses: unknown[] = []
		workspace.on('sync:status', (status) => statuses.push(status))
		await vi.advanceTimersByTimeAsync(150)
		await workspace.ready
		expect(workspace.status()).toEqual({
			lifecycle: 'ready',
			sync: 'repairing',
			missingPeerIds: ['frozen-peer'],
		})
		const request = syncRequests('late-repair')[0]

		respondToSync('late-repair', request, 'frozen-peer', 'frozen-instance', {
			kept: {
				kind: 'set',
				key: 'kept',
				value: true,
				clock: { wallTime: 20, logical: 0 },
				tabId: 'frozen-peer',
				instanceId: 'frozen-instance',
				operationId: 'kept-operation',
			},
			gone: {
				kind: 'delete',
				key: 'gone',
				clock: { wallTime: 21, logical: 0 },
				tabId: 'frozen-peer',
				instanceId: 'frozen-instance',
				operationId: 'gone-operation',
			},
		})

		expect(workspace.state.get('kept')).toBe(true)
		expect(workspace.state.get('gone')).toBeUndefined()
		expect(workspace.state.keys()).toEqual(['kept'])
		expect(workspace.status().sync).toBe('complete')
		expect(statuses).toEqual([
			{ lifecycle: 'ready', sync: 'repairing', missingPeerIds: ['frozen-peer'] },
			{ lifecycle: 'ready', sync: 'complete', missingPeerIds: [] },
		])
		workspace.destroy()
	})

	it('completes repair when presence proves the missing peer has left', async () => {
		seedPeer('peer-left-repair', 'departed-peer')
		const workspace = createWorkspace('peer-left-repair', { readyTimeout: 100 })
		await vi.advanceTimersByTimeAsync(100)
		await workspace.ready
		expect(workspace.status().missingPeerIds).toEqual(['departed-peer'])

		const channel = bcMock.instances.find((instance) => instance.name === 'tabula:peer-left-repair')
		channel?.simulateMessage(
			makeMessage({
				type: 'tab:leave',
				from: { tabId: 'departed-peer', instanceId: 'departed-instance' },
				payload: null,
			}),
		)

		expect(workspace.status()).toEqual({
			lifecycle: 'ready',
			sync: 'complete',
			missingPeerIds: [],
		})
		workspace.destroy()
	})

	it('bootstraps an empty simultaneous cohort through the lowest instance', async () => {
		seedPeer('empty-cohort', 'peer-b')
		const workspace = createWorkspace('empty-cohort', { readyTimeout: 500 })
		await vi.advanceTimersByTimeAsync(75)
		const request = syncRequests('empty-cohort')[0]
		respondToSync('empty-cohort', request, 'peer-b', 'zzzz-peer-instance', {}, 'initializing')
		await workspace.ready

		expect(workspace.status()).toEqual({
			lifecycle: 'ready',
			sync: 'complete',
			missingPeerIds: [],
		})
		workspace.destroy()
	})

	it('cancels post-ready repair rounds on destroy', async () => {
		seedPeer('destroy-repair', 'missing-peer')
		const workspace = createWorkspace('destroy-repair', { readyTimeout: 100 })
		await vi.advanceTimersByTimeAsync(100)
		await workspace.ready
		expect(workspace.status().sync).toBe('repairing')
		const countBeforeDestroy = syncRequests('destroy-repair').length

		workspace.destroy()
		await vi.advanceTimersByTimeAsync(5000)
		expect(syncRequests('destroy-repair')).toHaveLength(countBeforeDestroy)
		expect(workspace.status().lifecycle).toBe('destroyed')
	})

	it('terminal workspaces reject every public operation except status and destroy', async () => {
		const workspace = await initialize()
		const unsubscribe = workspace.state.on('*', () => undefined)
		workspace.destroy()

		expect(() => workspace.state.get('key')).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.state.set('key', 'value')).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.state.keys()).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.views.list()).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.tabs.list()).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.claim('editor')).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.open('editor', { url: '/' })).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.focus('editor')).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.isLeader()).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.on('tab:join', () => undefined)).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.off('tab:join', () => undefined)).toThrow(WorkspaceDestroyedError)
		expect(() => workspace.onLeader(() => undefined)).toThrow(WorkspaceDestroyedError)
		expect(() => unsubscribe()).not.toThrow()
		expect(workspace.status().lifecycle).toBe('destroyed')
		expect(() => workspace.destroy()).not.toThrow()
	})

	it('queued async open rejects with the terminal destroy error', async () => {
		const workspace = createWorkspace('queued-open')
		const opened = workspace.open('editor', { url: '/' })
		workspace.destroy()
		await expect(opened).rejects.toBeInstanceOf(WorkspaceDestroyedError)
	})

	it('persisted pagehide suspends without leave and pageshow resumes the same identity once', async () => {
		const workspace = await initialize()
		const tabId = workspace.tabs.current().id
		const setup = vi.fn(() => vi.fn())
		workspace.onLeader(setup)
		expect(setup).toHaveBeenCalledTimes(1)
		bcMock.instances[0].postMessage.mockClear()

		windowMock.getHandlers('pagehide')[0]({ persisted: true } as PageTransitionEvent)
		expect(workspace.status().lifecycle).toBe('bfcache-suspended')
		expect(bcMock.instances[0].postMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: 'tab:leave' }),
		)
		workspace.state.set('queued-during-suspension', true)

		windowMock.getHandlers('pageshow')[0]({ persisted: true } as PageTransitionEvent)
		await vi.advanceTimersByTimeAsync(1000)
		expect(workspace.status().lifecycle).toBe('ready')
		expect(workspace.tabs.current().id).toBe(tabId)
		expect(workspace.state.get('queued-during-suspension')).toBe(true)
		expect(setup).toHaveBeenCalledTimes(2)
		expect(documentMock.getHandlers('visibilitychange')).toHaveLength(2)
		workspace.destroy()
	})

	it('non-persisted pagehide performs terminal cleanup', async () => {
		const workspace = await initialize()
		windowMock.getHandlers('pagehide')[0]({ persisted: false } as PageTransitionEvent)
		expect(workspace.status().lifecycle).toBe('destroyed')
		expect(bcMock.instances[0].close).toHaveBeenCalledTimes(1)
	})

	it.each([
		[
			'secure context',
			() => Object.defineProperty(globalThis, 'isSecureContext', { value: false }),
		],
		[
			'Web Locks',
			() => Object.defineProperty(globalThis, 'navigator', { value: { locks: undefined } }),
		],
	])('fails synchronously without attaching resources when %s is unavailable', (_name, block) => {
		block()
		expect(() => createWorkspace('missing-capability')).toThrow(CapabilityError)
		expect(bcMock.instances).toHaveLength(0)
		expect(windowMock.getHandlers('pagehide')).toHaveLength(0)
	})

	it('fails synchronously when storage probing is blocked', () => {
		vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError')
		})
		expect(() => createWorkspace('blocked-storage')).toThrow(CapabilityError)
		expect(bcMock.instances).toHaveLength(0)
	})

	it('enters failed when asynchronous initialization loses storage', async () => {
		const workspace = createWorkspace('async-storage-failure')
		const ready = workspace.ready
		vi.spyOn(localStorage, 'length', 'get').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError')
		})
		await vi.advanceTimersByTimeAsync(1000)

		await expect(ready).rejects.toBeInstanceOf(WorkspaceFailedError)
		expect(workspace.status().lifecycle).toBe('failed')
		expect(() => workspace.state.get('key')).toThrow(WorkspaceFailedError)
		expect(bcMock.instances[0].close).toHaveBeenCalledTimes(1)
	})

	it('fails a quota-blocked view claim without a partial local claim', async () => {
		const workspace = await initialize()
		vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
			throw new DOMException('quota', 'QuotaExceededError')
		})
		await expect(workspace.claim('editor')).rejects.toBeInstanceOf(StorageOperationError)
		expect(workspace.views.has('editor')).toBe(false)
		workspace.destroy()
	})

	it('removes open intent metadata when the popup is blocked', async () => {
		const workspace = await initialize()
		windowMock.open.mockReturnValueOnce(null)

		await expect(
			workspace.open('editor', { url: '/claim.html', syncKeys: ['document'] }),
		).rejects.toThrow('blocked the popup')
		expect(localStorage.getItem('tabula:lifecycle:pending-open:editor')).toBeNull()
		workspace.destroy()
	})

	it('stores metadata only and removes it when open times out', async () => {
		const workspace = createWorkspace<Record<string, unknown>>('open-timeout', {
			openTimeout: 250,
		})
		await vi.advanceTimersByTimeAsync(1000)
		await workspace.ready
		const opened = workspace.open('editor', { url: '/claim.html', syncKeys: ['document'] })
		const timedOut = expect(opened).rejects.toThrow('within 250ms')
		await Promise.resolve()
		const key = 'tabula:open-timeout:pending-open:editor'
		const stored = JSON.parse(localStorage.getItem(key) ?? '{}')
		expect(stored).toMatchObject({ view: 'editor', syncKeys: ['document'] })
		expect(stored).not.toHaveProperty('syncedState')

		await vi.advanceTimersByTimeAsync(250)
		await timedOut
		expect(localStorage.getItem(key)).toBeNull()
		workspace.destroy()
	})

	it('removes a pending open intent and rejects it on destroy', async () => {
		const workspace = await initialize()
		const opened = workspace.open('editor', { url: '/claim.html' })
		await Promise.resolve()
		expect(localStorage.getItem('tabula:lifecycle:pending-open:editor')).not.toBeNull()

		workspace.destroy()
		await expect(opened).rejects.toBeInstanceOf(WorkspaceDestroyedError)
		expect(localStorage.getItem('tabula:lifecycle:pending-open:editor')).toBeNull()
	})

	it('supersedes an older open for the same view without deleting the newer intent', async () => {
		const workspace = await initialize()
		const first = workspace.open('editor', { url: '/first' })
		const firstRejected = expect(first).rejects.toThrow('superseded')
		await Promise.resolve()
		const firstIntent = JSON.parse(
			localStorage.getItem('tabula:lifecycle:pending-open:editor') ?? '{}',
		).intentId
		const second = workspace.open('editor', { url: '/second' })
		await Promise.resolve()

		await firstRejected
		const current = JSON.parse(localStorage.getItem('tabula:lifecycle:pending-open:editor') ?? '{}')
		expect(current.intentId).not.toBe(firstIntent)
		workspace.destroy()
		await expect(second).rejects.toBeInstanceOf(WorkspaceDestroyedError)
	})
})
