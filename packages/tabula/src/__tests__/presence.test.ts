import { Presence } from '@tabula/tabula'
import type { Message } from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStubChannel, installMockDocument, installMockStorage, makeMessage } from './helpers'

describe('Presence', () => {
	let docMock: ReturnType<typeof installMockDocument>
	let storageMock: ReturnType<typeof installMockStorage>
	let stubChannel: ReturnType<typeof createStubChannel>
	let onJoin: ReturnType<typeof vi.fn>
	let onLeave: ReturnType<typeof vi.fn>

	const TAB_ID = 'tab-self'
	const HEARTBEAT_MS = 1500
	const TIMEOUT_MS = 5000

	beforeEach(() => {
		vi.useFakeTimers()
		docMock = installMockDocument('visible')
		storageMock = installMockStorage()
		stubChannel = createStubChannel(TAB_ID)
		onJoin = vi.fn()
		onLeave = vi.fn()
	})

	afterEach(() => {
		vi.useRealTimers()
		docMock.restore()
		storageMock.restore()
	})

	function createPresence(tabId = TAB_ID) {
		return new Presence(
			stubChannel as any,
			tabId,
			HEARTBEAT_MS,
			TIMEOUT_MS,
			onJoin,
			onLeave,
			'test-ns',
		)
	}

	describe('construction', () => {
		it('registers self in tab map on construction', () => {
			const presence = createPresence()
			const self = presence.getSelf()

			expect(self).toBeDefined()
			expect(self.id).toBe(TAB_ID)
			expect(self.view).toBeNull()
			expect(self.visible).toBe(true)
			expect(self.firstSeenAt).toBeTypeOf('number')
			expect(self.lastSeenAt).toBeTypeOf('number')
		})
	})

	describe('handleMessage tab:announce', () => {
		it('new tab creates entry and fires onJoin', () => {
			const presence = createPresence()

			const msg = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				payload: { visible: true, view: null },
			})
			presence.handleMessage(msg)

			const remote = presence.getTab('tab-remote')
			expect(remote).toBeDefined()
			expect(remote?.id).toBe('tab-remote')
			expect(remote?.visible).toBe(true)
			expect(onJoin).toHaveBeenCalledTimes(1)
			expect(onJoin).toHaveBeenCalledWith(expect.objectContaining({ id: 'tab-remote' }))
		})

		it('triggers reciprocal announce', () => {
			const presence = createPresence()

			const msg = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				payload: { visible: true, view: null },
			})
			presence.handleMessage(msg)

			// The reciprocal announce is the second call to send (first may be other usage)
			expect(stubChannel.send).toHaveBeenCalledWith(
				'tab:announce',
				expect.objectContaining({ visible: true }),
			)
		})

		it('repeated announce from known tab does NOT fire onJoin but updates lastSeenAt', () => {
			const presence = createPresence()

			const msg1 = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				id: 'msg-1',
				payload: { visible: true, view: null },
			})
			presence.handleMessage(msg1)
			expect(onJoin).toHaveBeenCalledTimes(1)

			const firstTab = presence.getTab('tab-remote')
			const firstLastSeen = firstTab.lastSeenAt

			// Advance time so lastSeenAt differs
			vi.advanceTimersByTime(100)

			const msg2 = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				id: 'msg-2',
				payload: { visible: true, view: 'editor' },
			})
			presence.handleMessage(msg2)

			// onJoin should NOT have been called again
			expect(onJoin).toHaveBeenCalledTimes(1)

			// lastSeenAt should be updated
			const updatedTab = presence.getTab('tab-remote')
			expect(updatedTab.lastSeenAt).toBeGreaterThanOrEqual(firstLastSeen)
		})

		it('preserves firstSeenAt from first observation', () => {
			const presence = createPresence()

			const msg1 = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				id: 'msg-a',
				payload: { visible: true, view: null },
			})
			presence.handleMessage(msg1)
			const firstSeenAt = presence.getTab('tab-remote')?.firstSeenAt

			vi.advanceTimersByTime(500)

			const msg2 = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				id: 'msg-b',
				payload: { visible: true, view: null },
			})
			presence.handleMessage(msg2)

			expect(presence.getTab('tab-remote')?.firstSeenAt).toBe(firstSeenAt)
		})
	})

	describe('handleMessage tab:heartbeat', () => {
		it('updates lastSeenAt for known tab', () => {
			const presence = createPresence()

			// First register the tab via announce
			const announce = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				id: 'ann-1',
				payload: { visible: true, view: null },
			})
			presence.handleMessage(announce)
			const initialLastSeen = presence.getTab('tab-remote')?.lastSeenAt

			vi.advanceTimersByTime(200)

			const heartbeat = makeMessage({
				type: 'tab:heartbeat',
				from: 'tab-remote',
				id: 'hb-1',
			})
			presence.handleMessage(heartbeat)

			expect(presence.getTab('tab-remote')?.lastSeenAt).toBeGreaterThan(initialLastSeen)
		})

		it('unknown tab heartbeat is ignored (prune uses localStorage instead)', () => {
			const presence = createPresence()

			const heartbeat = makeMessage({
				type: 'tab:heartbeat',
				from: 'tab-unknown',
				id: 'hb-2',
			})

			// Heartbeats from unknown tabs are ignored — prune discovers alive tabs via localStorage
			presence.handleMessage(heartbeat)
			expect(presence.getTab('tab-unknown')).toBeUndefined()
		})
	})

	describe('handleMessage tab:leave', () => {
		it('removes tab and fires onLeave', () => {
			const presence = createPresence()

			// Register remote tab
			const announce = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				id: 'ann-2',
				payload: { visible: true, view: null },
			})
			presence.handleMessage(announce)
			expect(presence.getTab('tab-remote')).toBeDefined()

			const leave = makeMessage({
				type: 'tab:leave',
				from: 'tab-remote',
				id: 'leave-1',
			})
			presence.handleMessage(leave)

			expect(presence.getTab('tab-remote')).toBeUndefined()
			expect(onLeave).toHaveBeenCalledTimes(1)
			expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ id: 'tab-remote' }))
		})

		it('unknown tab is silently ignored', () => {
			const presence = createPresence()

			const leave = makeMessage({
				type: 'tab:leave',
				from: 'tab-ghost',
				id: 'leave-2',
			})

			presence.handleMessage(leave)
			expect(onLeave).not.toHaveBeenCalled()
		})
	})

	describe('start()', () => {
		it('sends announce on start', () => {
			const presence = createPresence()
			stubChannel.send.mockClear()

			presence.start()

			expect(stubChannel.send).toHaveBeenCalledWith(
				'tab:announce',
				expect.objectContaining({ visible: true }),
			)

			presence.stop()
		})
	})

	describe('heartbeat timer', () => {
		it('fires at heartbeatMs intervals', () => {
			const presence = createPresence()
			presence.start()
			stubChannel.send.mockClear()

			vi.advanceTimersByTime(HEARTBEAT_MS)

			expect(stubChannel.send).toHaveBeenCalledWith('tab:heartbeat', null)

			stubChannel.send.mockClear()
			vi.advanceTimersByTime(HEARTBEAT_MS)

			expect(stubChannel.send).toHaveBeenCalledWith('tab:heartbeat', null)

			presence.stop()
		})
	})

	describe('prune', () => {
		it('removes dead tabs (no localStorage entry) after timeout', () => {
			const presence = createPresence()
			presence.start()

			// Add a remote tab via announce (but no localStorage entry from them)
			const announce = makeMessage({
				type: 'tab:announce',
				from: 'tab-remote',
				id: 'ann-prune',
				payload: { visible: true, view: null, createdAt: Date.now() },
			})
			presence.handleMessage(announce)
			expect(presence.getTab('tab-remote')).toBeDefined()

			// No localStorage entry → short timeout
			vi.advanceTimersByTime(TIMEOUT_MS + HEARTBEAT_MS)

			expect(presence.getTab('tab-remote')).toBeUndefined()
			expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ id: 'tab-remote' }))

			presence.stop()
		})

		it('tabs with localStorage activity survive longer (3x timeout)', () => {
			const presence = createPresence()
			presence.start()

			// Add a remote tab
			const announce = makeMessage({
				type: 'tab:announce',
				from: 'tab-active',
				id: 'ann-active',
				payload: { visible: true, view: null, createdAt: Date.now() },
			})
			presence.handleMessage(announce)

			// Simulate the remote tab writing its presence to localStorage
			localStorage.setItem(
				'tabula:test-ns:tab:tab-active',
				JSON.stringify({ lastSeen: Date.now(), createdAt: Date.now(), visible: true }),
			)

			// Advance past normal timeout — should survive (localStorage is fresh)
			vi.advanceTimersByTime(TIMEOUT_MS + HEARTBEAT_MS)
			expect(presence.getTab('tab-active')).toBeDefined()

			// Advance past 3x timeout — now should be pruned
			vi.advanceTimersByTime(TIMEOUT_MS * 3)
			expect(presence.getTab('tab-active')).toBeUndefined()
			expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ id: 'tab-active' }))

			presence.stop()
		})

		it('self is never pruned', () => {
			const presence = createPresence()
			presence.start()

			// Advance well past any timeout
			vi.advanceTimersByTime(TIMEOUT_MS * 10)

			expect(presence.getSelf()).toBeDefined()
			expect(presence.getSelf().id).toBe(TAB_ID)

			presence.stop()
		})
	})

	describe('setView()', () => {
		it('updates currentView and TabMeta', () => {
			const presence = createPresence()

			expect(presence.getSelf().view).toBeNull()

			presence.setView('editor')

			expect(presence.getSelf().view).toBe('editor')
		})
	})

	describe('visibility change', () => {
		it('visibility change to visible triggers re-announce', () => {
			const presence = createPresence()
			presence.start()
			stubChannel.send.mockClear()

			// Simulate going hidden then visible
			docMock.setVisibility('hidden')
			const visHandlers = docMock.getHandlers('visibilitychange')
			expect(visHandlers.length).toBeGreaterThan(0)

			// Trigger visibility change while hidden — no announce expected
			visHandlers[0]()
			const hiddenCalls = stubChannel.send.mock.calls.filter(
				(c: unknown[]) => c[0] === 'tab:announce',
			)
			expect(hiddenCalls).toHaveLength(0)

			stubChannel.send.mockClear()

			// Now become visible — should trigger announce
			docMock.setVisibility('visible')
			visHandlers[0]()

			expect(stubChannel.send).toHaveBeenCalledWith(
				'tab:announce',
				expect.objectContaining({ visible: true }),
			)

			presence.stop()
		})
	})

	describe('stop()', () => {
		it('clears timers and removes visibility handler', () => {
			const presence = createPresence()
			presence.start()

			const visHandlersBefore = docMock.getHandlers('visibilitychange')
			expect(visHandlersBefore.length).toBeGreaterThan(0)

			presence.stop()

			// Visibility handler should be removed
			const visHandlersAfter = docMock.getHandlers('visibilitychange')
			expect(visHandlersAfter).toHaveLength(0)

			// Timers should not fire after stop
			stubChannel.send.mockClear()
			vi.advanceTimersByTime(HEARTBEAT_MS * 5)
			const heartbeats = stubChannel.send.mock.calls.filter(
				(c: unknown[]) => c[0] === 'tab:heartbeat',
			)
			expect(heartbeats).toHaveLength(0)
		})
	})

	describe('broadcastLeave()', () => {
		it('sends tab:leave message', () => {
			const presence = createPresence()

			presence.broadcastLeave()

			expect(stubChannel.send).toHaveBeenCalledWith('tab:leave', null)
		})
	})
})
