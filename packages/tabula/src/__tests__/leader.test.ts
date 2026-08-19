import { StorageCorruptionError } from '@tabula/runtime'
import { Leader } from '@tabula/tabula'
import type { Message } from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createStubChannel,
	createStubPresence,
	installMockStorage,
	installMockWindow,
	makeTab,
} from './helpers'

function leaderMessage(
	generation: number | undefined,
	tabId = 'remote-tab',
	instanceId = 'remote-instance',
): Message {
	return {
		protocol: { major: 1, revision: 1, minRevision: 0 },
		type: 'leader:change',
		id: `message-${generation ?? 'legacy'}`,
		from: { tabId, instanceId },
		sentAt: Date.now(),
		payload: generation === undefined ? { tabId } : { generation, tabId, instanceId },
	}
}

describe('Leader Web Lock authority', () => {
	let storageMock: ReturnType<typeof installMockStorage>
	let windowMock: ReturnType<typeof installMockWindow>

	beforeEach(() => {
		storageMock = installMockStorage()
		windowMock = installMockWindow()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		windowMock.restore()
		storageMock.restore()
	})

	function createLeader(
		namespace: string,
		tabId: string,
		onChange = vi.fn(),
		onAuthorityChange = vi.fn(),
		onError = vi.fn(),
	) {
		const channel = Object.assign(createStubChannel(tabId), {
			getIdentity: () => ({ tabId, instanceId: `${tabId}-instance` }),
		})
		const presence = createStubPresence(tabId)
		const leader = new Leader(
			namespace,
			channel as any,
			presence as any,
			onChange,
			onAuthorityChange,
			onError,
		)
		return { leader, channel, presence, onChange, onAuthorityChange, onError }
	}

	it('holds the exact namespace lock and publishes a persistent generation', async () => {
		const { leader, channel, onChange, onAuthorityChange } = createLeader('my workspace', 'tab-a')
		leader.start()

		await vi.waitFor(() => expect(leader.isLeader()).toBe(true))
		expect(windowMock.locks.requestedNames).toEqual(['tabula-js:v1:my%20workspace:leader'])
		expect(localStorage.getItem('tabula:my%20workspace:leader-generation')).toBe('1')
		expect(onChange).toHaveBeenCalledWith('tab-a')
		expect(onAuthorityChange).toHaveBeenCalledWith(true)
		expect(channel.send).toHaveBeenCalledWith(
			'leader:change',
			{
				generation: 1,
				tabId: 'tab-a',
				instanceId: 'tab-a-instance',
			},
			undefined,
		)

		leader.stop()
		await vi.waitFor(() => expect(windowMock.locks.activeCount).toBe(0))
	})

	it('serializes contenders and increments generation on transfer', async () => {
		const first = createLeader('shared', 'tab-a')
		const second = createLeader('shared', 'tab-b')
		first.leader.start()
		second.leader.start()

		await vi.waitFor(() => expect(first.leader.isLeader()).toBe(true))
		expect(second.leader.isLeader()).toBe(false)
		expect(windowMock.locks.maxActiveCount).toBe(1)

		first.leader.stop()
		await vi.waitFor(() => expect(second.leader.isLeader()).toBe(true))
		expect(localStorage.getItem('tabula:shared:leader-generation')).toBe('2')
		expect(windowMock.locks.maxActiveCount).toBe(1)

		second.leader.stop()
		await vi.waitFor(() => expect(windowMock.locks.activeCount).toBe(0))
	})

	it('aborts a queued request without acquiring authority', async () => {
		const first = createLeader('queued', 'tab-a')
		const second = createLeader('queued', 'tab-b')
		first.leader.start()
		second.leader.start()
		await vi.waitFor(() => expect(first.leader.isLeader()).toBe(true))

		second.leader.stop()
		first.leader.stop()
		await vi.waitFor(() => expect(windowMock.locks.activeCount).toBe(0))

		expect(second.onAuthorityChange).not.toHaveBeenCalledWith(true)
		expect(localStorage.getItem('tabula:queued:leader-generation')).toBe('1')
		expect(second.onError).not.toHaveBeenCalled()
	})

	it('demotes before voluntarily releasing a held lock and does so once', async () => {
		const transitions: string[] = []
		const authority = vi.fn((held: boolean) => {
			transitions.push(`${held}:${windowMock.locks.isHeld('tabula-js:v1:ordering:leader')}`)
		})
		const { leader } = createLeader('ordering', 'tab-a', vi.fn(), authority)
		leader.start()
		await vi.waitFor(() => expect(leader.isLeader()).toBe(true))

		leader.stop()
		leader.stop()
		expect(transitions).toEqual(['true:true', 'false:true'])
		await vi.waitFor(() => expect(windowMock.locks.activeCount).toBe(0))
		expect(authority).toHaveBeenCalledTimes(2)
	})

	it('rejects stale, conflicting, and unfenced projections', () => {
		const remoteOld = makeTab({ id: 'remote-old' })
		const remoteNew = makeTab({ id: 'remote-new' })
		const onChange = vi.fn()
		const { leader, presence } = createLeader('projection', 'self', onChange)
		presence.setTabs([remoteOld, remoteNew])

		leader.handleMessage(leaderMessage(5, 'remote-old', 'instance-old'))
		expect(leader.getLeaderId()).toBe('remote-old')
		onChange.mockClear()

		leader.handleMessage(leaderMessage(4, 'remote-new', 'instance-new'))
		leader.handleMessage(leaderMessage(5, 'remote-new', 'instance-new'))
		leader.handleMessage(leaderMessage(undefined, 'remote-new', 'instance-new'))
		expect(leader.getLeaderId()).toBe('remote-old')
		expect(onChange).not.toHaveBeenCalled()

		leader.handleMessage(leaderMessage(6, 'remote-new', 'instance-new'))
		expect(leader.getLeaderId()).toBe('remote-new')
		expect(onChange).toHaveBeenCalledWith('remote-new')
	})

	it('answers a late-join query only while holding authority', async () => {
		const { leader, channel } = createLeader('late-join', 'tab-a')
		leader.start()
		await vi.waitFor(() => expect(leader.isLeader()).toBe(true))
		channel.send.mockClear()

		leader.handleMessage({
			protocol: { major: 1, revision: 1, minRevision: 0 },
			type: 'leader:query',
			id: 'query-1',
			from: { tabId: 'tab-b', instanceId: 'tab-b-instance' },
			sentAt: Date.now(),
			payload: null,
		})
		expect(channel.send).toHaveBeenCalledWith(
			'leader:change',
			expect.objectContaining({ generation: 1, tabId: 'tab-a' }),
			{ tabId: 'tab-b', instanceId: 'tab-b-instance' },
		)

		leader.stop()
		channel.send.mockClear()
		leader.handleMessage({
			protocol: { major: 1, revision: 1, minRevision: 0 },
			type: 'leader:query',
			id: 'query-2',
			from: { tabId: 'tab-b', instanceId: 'tab-b-instance' },
			sentAt: Date.now(),
			payload: null,
		})
		expect(channel.send).not.toHaveBeenCalled()
	})

	it('fails acquisition on a corrupt generation without running leader work', async () => {
		localStorage.setItem('tabula:corrupt:leader-generation', 'not-a-generation')
		const { leader, onAuthorityChange, onError } = createLeader('corrupt', 'tab-a')
		leader.start()

		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
		expect(onError.mock.calls[0][0]).toBeInstanceOf(StorageCorruptionError)
		expect(onAuthorityChange).not.toHaveBeenCalledWith(true)
		expect(leader.isLeader()).toBe(false)
		expect(localStorage.getItem('tabula:corrupt:leader-generation')).toBe('not-a-generation')
	})
})
