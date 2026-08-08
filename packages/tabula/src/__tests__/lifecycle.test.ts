import { resetDocumentIdentityForTesting } from '@tabula/runtime'
import {
	CapabilityError,
	StorageOperationError,
	WorkspaceDestroyedError,
	WorkspaceFailedError,
	createWorkspace,
} from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	installMockBroadcastChannel,
	installMockDocument,
	installMockStorage,
	installMockWindow,
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
		expect(() => workspace.claim('editor')).toThrow(StorageOperationError)
		expect(workspace.views.has('editor')).toBe(false)
		workspace.destroy()
	})
})
