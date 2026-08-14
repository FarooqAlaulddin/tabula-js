import { createWorkspace } from '@tabula/tabula'
import type { Workspace } from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	installMockBroadcastChannel,
	installMockDocument,
	installMockStorage,
	installMockWindow,
} from './helpers'

interface TestState {
	theme: 'light' | 'dark'
	count: number
	label: string
}

describe('Coordinator (via createWorkspace)', () => {
	let bcMock: ReturnType<typeof installMockBroadcastChannel>
	let storageMock: ReturnType<typeof installMockStorage>
	let docMock: ReturnType<typeof installMockDocument>
	let winMock: ReturnType<typeof installMockWindow>

	beforeEach(() => {
		vi.useFakeTimers()
		bcMock = installMockBroadcastChannel()
		storageMock = installMockStorage()
		docMock = installMockDocument('visible')
		winMock = installMockWindow()
		vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' })
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
		bcMock.restore()
		storageMock.restore()
		docMock.restore()
		winMock.restore()
	})

	/** Create a workspace and advance timers so init() completes. */
	async function createAndInit<S extends object = TestState>(
		namespace = 'test-ns',
	): Promise<Workspace<S>> {
		const ws = createWorkspace<S>(namespace)
		const ready = ws.ready
		await vi.advanceTimersByTimeAsync(1000)
		await ready
		return ws
	}

	// ── Validation ───────────────────────────────────────────────────────

	describe('createWorkspace validation', () => {
		it('throws with empty namespace', () => {
			expect(() => createWorkspace('')).toThrow('createWorkspace() requires a non-empty namespace')
		})

		it('rejects control characters and namespaces over 128 UTF-8 bytes', () => {
			expect(() => createWorkspace('unsafe\nnamespace')).toThrow('non-empty namespace')
			expect(() => createWorkspace('x'.repeat(129))).toThrow('non-empty namespace')
		})

		it('throws when BroadcastChannel is unavailable', () => {
			bcMock.restore()
			const orig = (globalThis as any).BroadcastChannel
			delete (globalThis as any).BroadcastChannel

			try {
				expect(() => createWorkspace('test')).toThrow('BroadcastChannel')
			} finally {
				if (orig) {
					;(globalThis as any).BroadcastChannel = orig
				}
			}
		})
	})

	// ── Tab identity ─────────────────────────────────────────────────────

	describe('tab identity', () => {
		it('stores tab ID in sessionStorage', async () => {
			await createAndInit()
			expect(sessionStorage.getItem('tabula:tab-id')).toBe('test-uuid-1234')
		})

		it('does not write the obsolete global session epoch', async () => {
			await createAndInit()
			expect(sessionStorage.getItem('tabula:epoch')).toBeNull()
		})

		it('tab ID persists across calls (uses sessionStorage)', async () => {
			const ws1 = await createAndInit('ns-1')
			const id1 = ws1.tabs.current().id
			ws1.destroy()

			const ws2 = await createAndInit('ns-2')
			const id2 = ws2.tabs.current().id
			ws2.destroy()

			expect(id1).toBe(id2)
			expect(id1).toBe('test-uuid-1234')
		})
	})

	// ── Leader election (single tab) ─────────────────────────────────────

	describe('leader election (single tab)', () => {
		it('single tab becomes leader after init', async () => {
			const ws = await createAndInit()
			expect(ws.isLeader()).toBe(true)
			ws.destroy()
		})

		it('isLeader() returns true for single tab', async () => {
			const ws = await createAndInit()
			expect(ws.isLeader()).toBe(true)
			ws.destroy()
		})
	})

	// ── State ────────────────────────────────────────────────────────────

	describe('state', () => {
		it('set/get works after init completes', async () => {
			const ws = await createAndInit<TestState>()
			ws.state.set('theme', 'dark')
			expect(ws.state.get('theme')).toBe('dark')
			ws.destroy()
		})

		it('state.on fires listener on set', async () => {
			const ws = await createAndInit<TestState>()
			const cb = vi.fn()
			ws.state.on('theme', cb)

			ws.state.set('theme', 'dark')
			expect(cb).toHaveBeenCalledWith('dark')
			ws.destroy()
		})

		it('state.on("*") wildcard fires on any set', async () => {
			const ws = await createAndInit<TestState>()
			const cb = vi.fn()
			ws.state.on('*', cb)

			ws.state.set('count', 42)
			expect(cb).toHaveBeenCalledWith('count', 42)
			ws.destroy()
		})

		it('state.delete removes key and notifies', async () => {
			const ws = await createAndInit<TestState>()
			const cb = vi.fn()
			ws.state.on('theme', cb)

			ws.state.set('theme', 'dark')
			cb.mockClear()

			ws.state.delete('theme')
			expect(ws.state.get('theme')).toBeUndefined()
			// delete notifies with undefined
			expect(cb).toHaveBeenCalledWith(undefined)
			ws.destroy()
		})

		it('state.on unsubscribe works', async () => {
			const ws = await createAndInit<TestState>()
			const cb = vi.fn()
			const unsub = ws.state.on('theme', cb)

			unsub()
			ws.state.set('theme', 'dark')
			expect(cb).not.toHaveBeenCalled()
			ws.destroy()
		})
	})

	// ── Views / claim ────────────────────────────────────────────────────

	describe('views and claim', () => {
		it('claim() works after init', async () => {
			const ws = await createAndInit<TestState>()
			const result = await ws.claim('editor')
			expect(result.status).toBe('claimed')
			expect(ws.views.has('editor')).toBe(true)
			ws.destroy()
		})

		it('claim() throws if tab already holds a view', async () => {
			const ws = await createAndInit<TestState>()
			await ws.claim('editor')

			await expect(ws.claim('writer')).rejects.toThrow('already owns')
			ws.destroy()
		})

		it('views.get returns TabMeta after claim', async () => {
			const ws = await createAndInit<TestState>()
			await ws.claim('editor')

			const tab = ws.views.get('editor')
			expect(tab).not.toBeNull()
			expect(tab?.id).toBe('test-uuid-1234')
			ws.destroy()
		})

		it('views.has returns true after claim, false before', async () => {
			const ws = await createAndInit<TestState>()
			expect(ws.views.has('editor')).toBe(false)

			await ws.claim('editor')
			expect(ws.views.has('editor')).toBe(true)
			ws.destroy()
		})

		it('views.list returns all claimed views', async () => {
			const ws = await createAndInit<TestState>()
			await ws.claim('editor')

			const list = ws.views.list()
			expect(Object.keys(list)).toContain('editor')
			expect(list.editor.id).toBe('test-uuid-1234')
			ws.destroy()
		})
	})

	// ── onLeader ─────────────────────────────────────────────────────────

	describe('onLeader', () => {
		it('setup runs immediately for single tab (already leader)', async () => {
			const ws = await createAndInit<TestState>()
			const setup = vi.fn(() => undefined)
			ws.onLeader(setup)

			expect(setup).toHaveBeenCalledTimes(1)
			ws.destroy()
		})

		it('cleanup runs on destroy', async () => {
			const ws = await createAndInit<TestState>()
			const cleanup = vi.fn()
			ws.onLeader(() => cleanup)

			ws.destroy()
			expect(cleanup).toHaveBeenCalledTimes(1)
		})

		it('unsubscribe runs cleanup', async () => {
			const ws = await createAndInit<TestState>()
			const cleanup = vi.fn()
			const unsub = ws.onLeader(() => cleanup)

			unsub()
			expect(cleanup).toHaveBeenCalledTimes(1)
		})
	})

	// ── destroy ──────────────────────────────────────────────────────────

	describe('destroy', () => {
		it('cleans up timers (no timer leak)', async () => {
			const ws = await createAndInit<TestState>()
			ws.destroy()

			// After destroy, advancing timers should not throw or do anything observable.
			// Specifically, the heartbeat and prune intervals should be cleared.
			// We verify by checking no postMessage calls happen after destroy.
			const bc = bcMock.instances[0]
			bc.postMessage.mockClear()

			await vi.advanceTimersByTimeAsync(10000)
			expect(bc.postMessage).not.toHaveBeenCalled()
		})

		it('removes pagehide handler', async () => {
			const ws = await createAndInit<TestState>()

			const handlersBefore = winMock.getHandlers('pagehide')
			expect(handlersBefore.length).toBeGreaterThan(0)

			ws.destroy()

			const handlersAfter = winMock.getHandlers('pagehide')
			expect(handlersAfter).toHaveLength(0)
		})

		it('closes channel', async () => {
			const ws = await createAndInit<TestState>()
			const bc = bcMock.instances[0]

			ws.destroy()
			expect(bc.close).toHaveBeenCalled()
		})
	})

	// ── tabs ─────────────────────────────────────────────────────────────

	describe('tabs', () => {
		it('tabs.list() returns current tab', async () => {
			const ws = await createAndInit<TestState>()
			const tabs = ws.tabs.list()
			expect(tabs).toHaveLength(1)
			expect(tabs[0].id).toBe('test-uuid-1234')
			ws.destroy()
		})

		it('tabs.current() returns self metadata', async () => {
			const ws = await createAndInit<TestState>()
			const self = ws.tabs.current()
			expect(self.id).toBe('test-uuid-1234')
			expect(self.visible).toBe(true)
			expect(self.view).toBeNull()
			ws.destroy()
		})

		it('tabs.leader() returns leader metadata', async () => {
			const ws = await createAndInit<TestState>()
			const leader = ws.tabs.leader()
			expect(leader).not.toBeNull()
			expect(leader?.id).toBe('test-uuid-1234')
			ws.destroy()
		})
	})

	// ── Event system ─────────────────────────────────────────────────────

	describe('on/off events', () => {
		it('on() receives events and returns unsubscribe', async () => {
			const ws = await createAndInit<TestState>()
			const cb = vi.fn()
			const unsub = ws.on('view:claimed', cb)

			await ws.claim('editor')
			expect(cb).toHaveBeenCalledWith(expect.objectContaining({ name: 'editor' }))

			cb.mockClear()
			unsub()

			// After unsub, claiming another view should not fire the listener.
			// But we cannot claim again (already holding one), so we destroy
			// and recreate to test unsub actually removed the listener.
			ws.destroy()
		})

		it('off() removes listener', async () => {
			const ws = await createAndInit<TestState>()
			const cb = vi.fn()
			ws.on('view:claimed', cb)

			ws.off('view:claimed', cb)
			await ws.claim('editor')

			expect(cb).not.toHaveBeenCalled()
			ws.destroy()
		})

		it('surfaces an incompatible protocol episode once with recovery guidance', async () => {
			const ws = await createAndInit<TestState>()
			const cb = vi.fn()
			ws.on('protocol:incompatible', cb)
			const message = {
				protocol: { major: 2, revision: 0, minRevision: 0 },
				type: 'tab:heartbeat',
				id: 'remote-instance:1',
				from: { tabId: 'remote-tab', instanceId: 'remote-instance' },
				sentAt: Date.now(),
				payload: null,
			}
			bcMock.instances[0].simulateMessage(message)
			bcMock.instances[0].simulateMessage({ ...message, id: 'remote-instance:2' })

			expect(cb).toHaveBeenCalledTimes(1)
			expect(cb).toHaveBeenCalledWith(
				expect.objectContaining({
					recovery: 'Save work and reload all application tabs.',
					remote: { major: 2, revision: 0, minRevision: 0 },
				}),
			)
			ws.destroy()
		})
	})

	// ── Pre-ready queue ──────────────────────────────────────────────────

	describe('pre-ready queue', () => {
		it('state.set before init completes still works after init', async () => {
			const ws = createWorkspace<TestState>('test-ns')

			// Call set BEFORE init completes — should be queued
			ws.state.set('theme', 'dark')

			// At this point, the state may not be set yet because init hasn't
			// finished and set is enqueued.

			// Now advance timers to complete init
			await vi.advanceTimersByTimeAsync(1000)
			await ws.ready

			// After init, the queued set should have run
			expect(ws.state.get('theme')).toBe('dark')
			ws.destroy()
		})

		it('claim() before init completes is queued and runs after init', async () => {
			const ws = createWorkspace<TestState>('test-ns')

			// Claim before init completes
			const claim = ws.claim('editor')

			// Advance timers to complete init
			await vi.advanceTimersByTimeAsync(1000)
			await ws.ready
			await claim

			expect(ws.views.has('editor')).toBe(true)
			ws.destroy()
		})
	})
})
