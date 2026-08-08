import { Channel, State, Views, createWorkspace } from '@tabula/tabula'
import type { Message, StateEntry } from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createStubChannel,
	createStubPresence,
	createStubRegistry,
	installMockBroadcastChannel,
	installMockDocument,
	installMockStorage,
	installMockWindow,
	makeMessage,
} from './helpers'

// ── Bug 1: Rapid same-tab writes within same millisecond ─────────────────

describe('Bug 1: rapid same-tab writes within same millisecond', () => {
	it('accepts multiple state:set messages from the same tab with the same timestamp but increasing versions', () => {
		const fixedTime = 1000
		vi.spyOn(Date, 'now').mockReturnValue(fixedTime)

		const tabId = 'writer-tab'
		const writerChannel = createStubChannel(tabId)
		const writer = new State<Record<string, unknown>>(writerChannel as any, tabId)

		// Perform three rapid writes to the same key — all get the same Date.now()
		writer.set('counter', 1)
		writer.set('counter', 2)
		writer.set('counter', 3)

		// Extract the entries that were broadcast
		const sentEntries: Array<{ key: string; entry: StateEntry }> = writerChannel.send.mock.calls
			.filter((call: unknown[]) => call[0] === 'state:set')
			.map((call: unknown[]) => call[1] as { key: string; entry: StateEntry })

		expect(sentEntries).toHaveLength(3)
		// All share the same timestamp and tabId, but versions must be 1, 2, 3
		expect(sentEntries[0].entry.ts).toBe(fixedTime)
		expect(sentEntries[1].entry.ts).toBe(fixedTime)
		expect(sentEntries[2].entry.ts).toBe(fixedTime)
		expect(sentEntries[0].entry.version).toBe(1)
		expect(sentEntries[1].entry.version).toBe(2)
		expect(sentEntries[2].entry.version).toBe(3)

		// Now simulate a SECOND tab receiving these messages in order
		const receiverId = 'receiver-tab'
		const receiverChannel = createStubChannel(receiverId)
		const receiver = new State<Record<string, unknown>>(receiverChannel as any, receiverId)

		for (const { key, entry } of sentEntries) {
			receiver.handleMessage(
				makeMessage({
					type: 'state:set',
					from: tabId,
					payload: { key, entry },
				}),
			)
		}

		// The receiver must have accepted ALL three writes — final value is 3
		expect(receiver.get('counter')).toBe(3)

		// Verify intermediate values were also accepted by checking
		// the entry's version reflects the final write
		const snapshot = receiver.getSnapshot()
		expect(snapshot.counter.version).toBe(3)
		expect(snapshot.counter.value).toBe(3)

		vi.restoreAllMocks()
	})

	it('does not regress to ignoring version when timestamps and tabIds match', () => {
		const fixedTime = 5000
		vi.spyOn(Date, 'now').mockReturnValue(fixedTime)

		const receiverChannel = createStubChannel('receiver')
		const receiver = new State<Record<string, unknown>>(receiverChannel as any, 'receiver')

		const sameTabId = 'writer-tab'

		// Simulate receiving version 1
		receiver.handleMessage(
			makeMessage({
				type: 'state:set',
				from: sameTabId,
				payload: {
					key: 'score',
					entry: { value: 10, ts: fixedTime, tabId: sameTabId, version: 1 } as StateEntry,
				},
			}),
		)
		expect(receiver.get('score')).toBe(10)

		// Simulate receiving version 2 with SAME timestamp and tabId
		receiver.handleMessage(
			makeMessage({
				type: 'state:set',
				from: sameTabId,
				payload: {
					key: 'score',
					entry: { value: 20, ts: fixedTime, tabId: sameTabId, version: 2 } as StateEntry,
				},
			}),
		)
		// The bug would cause this to still be 10 (first write wins)
		expect(receiver.get('score')).toBe(20)

		// Simulate receiving version 3
		receiver.handleMessage(
			makeMessage({
				type: 'state:set',
				from: sameTabId,
				payload: {
					key: 'score',
					entry: { value: 30, ts: fixedTime, tabId: sameTabId, version: 3 } as StateEntry,
				},
			}),
		)
		expect(receiver.get('score')).toBe(30)

		vi.restoreAllMocks()
	})
})

// ── Bug 2: view:claimed from unknown tab must not be silently dropped ────

describe('Bug 2: view:claimed from unknown tab must not be silently dropped', () => {
	it('registers the view in memory and fires onClaimed even when tab is not in presence', () => {
		const selfTabId = 'tab-self'
		const unknownTabId = 'tab-unknown'

		// The unknown tab is NOT in the presence list
		const registry = createStubRegistry()
		const channel = createStubChannel(selfTabId)
		const presence = createStubPresence(selfTabId, [])
		const onClaimed = vi.fn()
		const onVacant = vi.fn()
		const onConflict = vi.fn()

		const views = new Views(
			registry as any,
			channel as any,
			presence as any,
			'epoch-1',
			onClaimed,
			onVacant,
			onConflict,
		)

		// Verify the unknown tab is truly not in presence
		expect(presence.getTab(unknownTabId)).toBeUndefined()

		// Simulate receiving a view:claimed message from the unknown tab
		views.handleMessage(
			makeMessage({
				type: 'view:claimed',
				from: unknownTabId,
				payload: { name: 'editor', tabId: unknownTabId },
			}),
		)

		// The view MUST be registered in the in-memory map
		const holder = views.get('editor')
		expect(holder).not.toBeNull()
		expect(holder?.id).toBe(unknownTabId)

		// The onClaimed callback MUST have fired
		expect(onClaimed).toHaveBeenCalledTimes(1)
		expect(onClaimed).toHaveBeenCalledWith(
			'editor',
			expect.objectContaining({
				id: unknownTabId,
				view: 'editor',
				visible: true,
			}),
		)

		// The synthetic TabMeta should have firstSeenAt and lastSeenAt
		const syntheticTab = onClaimed.mock.calls[0][1]
		expect(syntheticTab.firstSeenAt).toBeGreaterThan(0)
		expect(syntheticTab.lastSeenAt).toBeGreaterThan(0)
	})

	it('the view is queryable via has() and listAll() after being claimed by an unknown tab', () => {
		const registry = createStubRegistry()
		const channel = createStubChannel('tab-self')
		const presence = createStubPresence('tab-self', [])
		const onClaimed = vi.fn()

		const views = new Views(
			registry as any,
			channel as any,
			presence as any,
			'epoch-1',
			onClaimed,
			vi.fn(),
			vi.fn(),
		)

		views.handleMessage(
			makeMessage({
				type: 'view:claimed',
				from: 'phantom-tab',
				payload: { name: 'dashboard', tabId: 'phantom-tab' },
			}),
		)

		expect(views.has('dashboard')).toBe(true)

		const all = views.listAll()
		expect(all).toHaveProperty('dashboard')
		expect(all.dashboard.id).toBe('phantom-tab')
	})
})

// ── Bug 3: syncState must always send sync request, even when alone ──────

describe('Bug 3: syncState always broadcasts state:sync-request even when alone', () => {
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
		vi.stubGlobal('crypto', { randomUUID: () => 'solo-tab-uuid' })
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
		bcMock.restore()
		storageMock.restore()
		docMock.restore()
		winMock.restore()
	})

	it('a single-tab workspace still sends state:sync-request during init', async () => {
		// Create workspace — only one tab will exist (no other tabs in presence)
		const ws = createWorkspace('regression-test-3')

		// Advance timers enough for the full init sequence to complete
		// init() has: sleep(100) for announce wait + syncState() with sleep(50)
		await vi.advanceTimersByTimeAsync(500)

		// Find the BroadcastChannel instance used for the namespace
		const bc = bcMock.instances.find((i) => i.name === 'tabula:regression-test-3')
		expect(bc).toBeDefined()

		// Collect all messages posted to the BroadcastChannel
		const postedMessages: Message[] = (bc as NonNullable<typeof bc>).postMessage.mock.calls.map(
			(call: unknown[]) => call[0] as Message,
		)

		// There MUST be a state:sync-request among the posted messages
		const syncRequests = postedMessages.filter((m) => m.type === 'state:sync-request')
		expect(syncRequests.length).toBeGreaterThanOrEqual(1)

		ws.destroy()
	})
})

// ── Bug 4: Message ID uniqueness across page refresh ─────────────────────

describe('Bug 4: message ID uniqueness across page refresh', () => {
	let bcMock: ReturnType<typeof installMockBroadcastChannel>
	let storageMock: ReturnType<typeof installMockStorage>

	beforeEach(() => {
		storageMock = installMockStorage()
		bcMock = installMockBroadcastChannel()
	})

	afterEach(() => {
		bcMock.restore()
		storageMock.restore()
	})

	it('message IDs use the per-load instance identity and a counter', () => {
		const tabId = 'persistent-tab-id'
		const channel = new Channel('test-ns', tabId, 'load-instance')
		const msg = channel.send('tab:announce', {})

		const parts = msg.id.split(':')
		expect(parts[0]).toBe('load-instance')
		expect(parts[1]).toMatch(/^\d+$/)
		expect(msg.from).toEqual({ tabId, instanceId: 'load-instance' })

		channel.close()
	})

	it('two Channel instances with the same tabId have distinct per-load identities', () => {
		const tabId = 'same-tab-id'
		const channel1 = new Channel('ns-a', tabId, 'instance-a')
		const channel2 = new Channel('ns-b', tabId, 'instance-b')

		const msg1 = channel1.send('tab:announce', {})
		const msg2 = channel2.send('tab:announce', {})

		expect(msg1.id).not.toBe(msg2.id)
		expect(msg1.id).toMatch(/^instance-a:\d+$/)
		expect(msg2.id).toMatch(/^instance-b:\d+$/)

		channel1.close()
		channel2.close()
	})

	it('message IDs are unique even when tabId is reused (simulating refresh)', () => {
		const tabId = 'refreshing-tab'

		// First "session" — create channel and send messages
		const channel1 = new Channel('ns-refresh', tabId, 'before-refresh')
		const ids1 = [
			channel1.send('tab:announce', {}).id,
			channel1.send('tab:heartbeat', {}).id,
			channel1.send('tab:announce', {}).id,
		]
		channel1.close()

		// Second load keeps the session tab id but gets a new instance id.
		const channel2 = new Channel('ns-refresh', tabId, 'after-refresh')
		const ids2 = [
			channel2.send('tab:announce', {}).id,
			channel2.send('tab:heartbeat', {}).id,
			channel2.send('tab:announce', {}).id,
		]
		channel2.close()

		// All 6 IDs must be globally unique
		const allIds = [...ids1, ...ids2]
		const uniqueIds = new Set(allIds)
		expect(uniqueIds.size).toBe(allIds.length)
	})
})
