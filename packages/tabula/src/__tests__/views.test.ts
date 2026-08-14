import type { StoredOpenIntent } from '@tabula/protocol'
import { ViewAlreadyClaimedError, Views } from '@tabula/tabula'
import type { StateOperation, ViewClaimToken, ViewRegistryEntry } from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createStubChannel,
	createStubPresence,
	createStubRegistry,
	installMockDocument,
	installMockStorage,
	installMockWindow,
	makeMessage,
	makeTab,
} from './helpers'

const namespace = 'test space'

function token(generation: number, claimId = `claim-${generation}`): ViewClaimToken {
	return { generation, claimId }
}

function entry(
	tabId: string,
	claimToken: ViewClaimToken,
	instanceId = `${tabId}-instance`,
): ViewRegistryEntry {
	return { tabId, instanceId, claimedAt: Date.now(), token: claimToken }
}

function createViews(
	tabId = 'tab-1',
	tabs: ReturnType<typeof makeTab>[] = [],
	registry = createStubRegistry(),
) {
	const channel = createStubChannel(tabId)
	const presence = createStubPresence(tabId, tabs)
	const onClaimed = vi.fn()
	const onVacant = vi.fn()
	const onConflict = vi.fn()
	const onIntentClaim = vi.fn()
	const applyIntentState = vi.fn()
	const onError = vi.fn()
	const views = new Views(
		namespace,
		registry as any,
		channel as any,
		presence as any,
		onClaimed,
		onVacant,
		onConflict,
		onIntentClaim,
		applyIntentState,
		onError,
	)
	return {
		views,
		registry,
		channel,
		presence,
		onClaimed,
		onVacant,
		onConflict,
		onIntentClaim,
		applyIntentState,
		onError,
	}
}

describe('Views', () => {
	let storageMock: ReturnType<typeof installMockStorage>
	let windowMock: ReturnType<typeof installMockWindow>
	let documentMock: ReturnType<typeof installMockDocument>

	beforeEach(() => {
		storageMock = installMockStorage()
		windowMock = installMockWindow()
		documentMock = installMockDocument()
	})

	afterEach(() => {
		documentMock.restore()
		windowMock.restore()
		storageMock.restore()
	})

	it('claims the exact encoded per-view Web Lock and publishes a fenced projection', async () => {
		const { views, registry, channel, presence, onClaimed } = createViews()

		const result = await views.claim('main/editor')

		expect(result.status).toBe('claimed')
		if (result.status !== 'claimed') return
		expect(windowMock.locks.requestedNames).toContain(
			'tabula-js:v1:test%20space:view:main%2Feditor',
		)
		expect(registry.set).toHaveBeenCalledWith(
			'main/editor',
			expect.objectContaining({
				tabId: 'tab-1',
				instanceId: 'tab-1-instance',
				token: result.authority.token,
			}),
		)
		expect(channel.send).toHaveBeenCalledWith(
			'view:claimed',
			expect.objectContaining({ name: 'main/editor', token: result.authority.token }),
		)
		expect(onClaimed).toHaveBeenCalledWith(
			'main/editor',
			expect.objectContaining({ id: 'tab-1' }),
			result.authority.token,
		)
		expect(presence.setView).toHaveBeenCalledWith('main/editor')
		expect(sessionStorage.getItem('tabula:test%20space:view-name')).toBe('main/editor')
	})

	it('is idempotent for the same view and rejects a second view in one tab', async () => {
		const { views } = createViews()
		const first = await views.claim('editor')
		const again = await views.claim('editor')

		expect(again).toEqual(first)
		await expect(views.claim('dashboard')).rejects.toMatchObject({
			name: ViewAlreadyClaimedError.name,
			currentView: 'editor',
		})
	})

	it('allows one winner when two tabs contend for the same view', async () => {
		const registry = createStubRegistry()
		const first = createViews('tab-1', [makeTab({ id: 'tab-2' })], registry)
		const second = createViews('tab-2', [makeTab({ id: 'tab-1' })], registry)

		const winner = await first.views.claim('editor')
		second.views.loadFromRegistry()
		const loser = await second.views.claim('editor')

		expect(winner.status).toBe('claimed')
		expect(loser).toEqual({
			status: 'conflict',
			owner: expect.objectContaining({ id: 'tab-1' }),
		})
		expect(second.onConflict).toHaveBeenCalledWith(
			'editor',
			expect.objectContaining({ id: 'tab-1' }),
			expect.objectContaining({ id: 'tab-2' }),
			expect.any(Object),
		)
	})

	it('ignores stale release handles and releases only the exact active token', async () => {
		const { views, registry, onVacant } = createViews()
		const first = await views.claim('editor')
		if (first.status !== 'claimed') return
		const stale = first.authority.token
		views.release('editor', stale)
		const second = await views.claim('editor')
		if (second.status !== 'claimed') return

		views.release('editor', stale)
		expect(views.has('editor')).toBe(true)
		expect(registry.delete).toHaveBeenCalledTimes(1)

		views.release('editor', second.authority.token)
		expect(views.has('editor')).toBe(false)
		expect(onVacant).toHaveBeenLastCalledWith('editor', second.authority.token)
	})

	it('fences release and focus messages with the exact token', async () => {
		const { views } = createViews()
		const result = await views.claim('editor')
		if (result.status !== 'claimed') return
		const active = result.authority.token

		views.handleMessage(
			makeMessage({ type: 'view:focus', payload: { name: 'editor', token: token(99) } }),
		)
		expect(window.focus).not.toHaveBeenCalled()
		views.handleMessage(
			makeMessage({ type: 'view:focus', payload: { name: 'editor', token: active } }),
		)
		expect(window.focus).toHaveBeenCalledOnce()

		views.handleMessage(
			makeMessage({
				type: 'view:release',
				payload: { name: 'editor', token: token(99), request: true },
			}),
		)
		expect(views.has('editor')).toBe(true)
		views.handleMessage(
			makeMessage({
				type: 'view:release',
				payload: { name: 'editor', token: active, request: true },
			}),
		)
		expect(views.has('editor')).toBe(false)
	})

	it('does not declare a frozen lock holder vacant', async () => {
		const remote = makeTab({ id: 'tab-remote' })
		const { views, registry, onVacant } = createViews('tab-self', [remote])
		const remoteToken = token(4)
		registry._store.set('editor', entry(remote.id, remoteToken))
		views.loadFromRegistry()

		let releaseLock: () => void = () => undefined
		const held = navigator.locks.request(
			'tabula-js:v1:test%20space:view:editor',
			{ mode: 'exclusive' },
			async () =>
				new Promise<void>((resolve) => {
					releaseLock = resolve
				}),
		)
		await Promise.resolve()
		views.cleanupForTab(remote.id)
		await Promise.resolve()

		expect(views.has('editor')).toBe(true)
		expect(onVacant).not.toHaveBeenCalled()
		releaseLock()
		await held
	})

	it('removes an exact stale projection only after proving its lock is vacant', async () => {
		const remote = makeTab({ id: 'tab-remote' })
		const { views, registry, onVacant } = createViews('tab-self', [remote])
		const remoteToken = token(7)
		registry._store.set('editor', entry(remote.id, remoteToken))
		views.loadFromRegistry()
		views.cleanupForTab(remote.id)
		await Promise.resolve()
		await Promise.resolve()

		expect(views.has('editor')).toBe(false)
		expect(registry.delete).toHaveBeenCalledWith('editor')
		expect(onVacant).toHaveBeenCalledWith('editor', remoteToken)
	})

	it('stores only intent metadata and sends selected state through the protocol', async () => {
		const { views, channel, applyIntentState } = createViews()
		const now = Date.now()
		const intent: StoredOpenIntent = {
			intentId: 'intent-1',
			view: 'editor',
			requester: { tabId: 'tab-opener', instanceId: 'opener-instance' },
			syncKeys: ['document'],
			createdAt: now,
			expiresAt: now + 10_000,
		}
		localStorage.setItem('tabula:test space:pending-open:editor', JSON.stringify(intent))
		const result = await views.claim('editor')
		if (result.status !== 'claimed') return

		expect(localStorage.getItem('tabula:test space:pending-open:editor')).toBeNull()
		expect(channel.send).toHaveBeenCalledWith(
			'view:intent-claim',
			{ intentId: intent.intentId, name: 'editor', token: result.authority.token },
			intent.requester,
		)

		const operation: StateOperation = {
			kind: 'set',
			key: 'document',
			value: { title: 'Protocol only' },
			clock: { wallTime: now, logical: 0 },
			tabId: 'tab-opener',
			instanceId: 'opener-instance',
			operationId: 'operation-1',
		}
		views.handleMessage(
			makeMessage({
				from: intent.requester,
				type: 'view:intent-state',
				payload: {
					intentId: intent.intentId,
					name: 'editor',
					token: result.authority.token,
					operations: [operation],
				},
			}),
		)
		expect(applyIntentState).toHaveBeenCalledWith([operation], intent.requester)
	})

	it('rejects intent state with a stale token or the wrong requester', async () => {
		const { views, applyIntentState } = createViews()
		const now = Date.now()
		const intent: StoredOpenIntent = {
			intentId: 'intent-1',
			view: 'editor',
			requester: { tabId: 'tab-opener', instanceId: 'opener-instance' },
			syncKeys: [],
			createdAt: now,
			expiresAt: now + 10_000,
		}
		localStorage.setItem('tabula:test space:pending-open:editor', JSON.stringify(intent))
		await views.claim('editor')
		views.handleMessage(
			makeMessage({
				from: { tabId: 'attacker', instanceId: 'attacker-instance' },
				type: 'view:intent-state',
				payload: { intentId: intent.intentId, name: 'editor', token: token(999), operations: [] },
			}),
		)
		expect(applyIntentState).not.toHaveBeenCalled()
	})

	it('lets a late child claim normally without consuming an expired open intent', async () => {
		const { views, channel } = createViews()
		const intent: StoredOpenIntent = {
			intentId: 'expired-intent',
			view: 'editor',
			requester: { tabId: 'tab-opener', instanceId: 'opener-instance' },
			syncKeys: ['document'],
			createdAt: 1,
			expiresAt: 2,
		}
		localStorage.setItem('tabula:test space:pending-open:editor', JSON.stringify(intent))

		expect((await views.claim('editor')).status).toBe('claimed')
		expect(localStorage.getItem('tabula:test space:pending-open:editor')).toBeNull()
		expect(channel.send).not.toHaveBeenCalledWith(
			'view:intent-claim',
			expect.anything(),
			expect.anything(),
		)
	})

	it('restores and reclaims the remembered view with a new generation', async () => {
		sessionStorage.setItem('tabula:test%20space:view-name', 'editor')
		localStorage.setItem('tabula:test%20space:view-generation:editor', '3')
		const { views } = createViews()

		await views.restoreRememberedView()

		expect(views.getAuthority('editor')?.token.generation).toBe(4)
	})

	it('keeps its held lock when listeners stop for bfcache suspension', async () => {
		const { views } = createViews()
		await views.claim('editor')
		views.start()
		views.stop()

		expect(windowMock.locks.isHeld('tabula-js:v1:test%20space:view:editor')).toBe(true)
	})

	it('loads modern registry projections and ignores older-token announcements', () => {
		const remote = makeTab({ id: 'tab-remote' })
		const { views, registry } = createViews('tab-self', [remote])
		registry._store.set('editor', entry(remote.id, token(5)))
		views.loadFromRegistry()
		views.handleMessage(
			makeMessage({
				from: remote.id,
				type: 'view:claimed',
				payload: {
					name: 'editor',
					tabId: remote.id,
					instanceId: `${remote.id}-instance`,
					token: token(4),
				},
			}),
		)

		expect(views.getAuthority('editor')?.token).toEqual(token(5))
	})
})
