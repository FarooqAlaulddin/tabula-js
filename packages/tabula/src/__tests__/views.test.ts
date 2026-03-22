import { Views } from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createStubChannel,
	createStubPresence,
	createStubRegistry,
	installMockDocument,
	installMockWindow,
	makeMessage,
	makeTab,
} from './helpers'

function setup(opts: { tabId?: string; tabs?: ReturnType<typeof makeTab>[] } = {}) {
	const tabId = opts.tabId ?? 'tab-1'
	const registry = createStubRegistry()
	const channel = createStubChannel(tabId)
	const presence = createStubPresence(tabId, opts.tabs ?? [])
	const epoch = 'epoch-1'
	const onClaimed = vi.fn()
	const onVacant = vi.fn()
	const onConflict = vi.fn()

	const views = new Views(
		registry as any,
		channel as any,
		presence as any,
		epoch,
		onClaimed,
		onVacant,
		onConflict,
	)

	return { views, registry, channel, presence, epoch, onClaimed, onVacant, onConflict }
}

// ── claim() happy path ────────────────────────────────────────────────────

describe('Views', () => {
	describe('claim() happy path', () => {
		it('claiming unclaimed view succeeds', () => {
			const { views, registry, channel, presence, onClaimed } = setup()

			const result = views.claim('editor')

			expect(result).toBe(true)

			// registry updated
			expect(registry.set).toHaveBeenCalledWith(
				'editor',
				expect.objectContaining({
					tabId: 'tab-1',
					epoch: 'epoch-1',
				}),
			)

			// in-memory updated
			expect(views.get('editor')).toEqual(expect.objectContaining({ id: 'tab-1' }))

			// onClaimed fired
			expect(onClaimed).toHaveBeenCalledWith('editor', expect.objectContaining({ id: 'tab-1' }))

			// channel.send called with view:claimed
			expect(channel.send).toHaveBeenCalledWith('view:claimed', {
				name: 'editor',
				tabId: 'tab-1',
			})

			// presence.setView called
			expect(presence.setView).toHaveBeenCalledWith('editor')
		})

		it('claim sets correct epoch', () => {
			const { views, registry } = setup()

			views.claim('dashboard')

			expect(registry.set).toHaveBeenCalledWith(
				'dashboard',
				expect.objectContaining({ epoch: 'epoch-1' }),
			)
		})
	})

	// ── claim() conflict ──────────────────────────────────────────────────

	describe('claim() conflict', () => {
		it('claiming view held by live tab returns false, onConflict fires', () => {
			const otherTab = makeTab({ id: 'tab-2' })
			const { views, registry, onConflict } = setup({ tabs: [otherTab] })

			// Pre-populate registry as if tab-2 holds the view
			registry._store.set('editor', {
				tabId: 'tab-2',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})

			const result = views.claim('editor')

			expect(result).toBe(false)
			expect(onConflict).toHaveBeenCalledWith(
				'editor',
				expect.objectContaining({ id: 'tab-2' }),
				expect.objectContaining({ id: 'tab-1' }),
			)
		})

		it('claiming view held by dead tab succeeds', () => {
			const { views, registry, presence, onClaimed } = setup()

			// Pre-populate registry with a tab that is NOT in presence (dead)
			registry._store.set('editor', {
				tabId: 'tab-dead',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})

			// tab-dead is not in presence.getAllTabs, so isAlive returns false
			const result = views.claim('editor')

			expect(result).toBe(true)
			expect(onClaimed).toHaveBeenCalledWith('editor', expect.objectContaining({ id: 'tab-1' }))
		})
	})

	// ── release() ─────────────────────────────────────────────────────────

	describe('release()', () => {
		it('removes from registry and in-memory, fires onVacant, sends view:release, clears presence view', () => {
			const { views, registry, channel, presence, onVacant } = setup()

			views.claim('editor')
			views.release('editor')

			// registry entry removed
			expect(registry.delete).toHaveBeenCalledWith('editor')

			// in-memory removed
			expect(views.get('editor')).toBeNull()

			// onVacant fired
			expect(onVacant).toHaveBeenCalledWith('editor')

			// channel sent view:release
			expect(channel.send).toHaveBeenCalledWith('view:release', { name: 'editor' })

			// presence view cleared
			expect(presence.setView).toHaveBeenCalledWith(null)
		})
	})

	// ── handleMessage ─────────────────────────────────────────────────────

	describe('handleMessage()', () => {
		it('view:claimed from remote updates in-memory and fires onClaimed', () => {
			const otherTab = makeTab({ id: 'tab-2' })
			const { views, onClaimed } = setup({ tabs: [otherTab] })

			views.handleMessage(
				makeMessage({
					type: 'view:claimed',
					from: 'tab-2',
					payload: { name: 'editor', tabId: 'tab-2' },
				}),
			)

			expect(views.get('editor')).toEqual(expect.objectContaining({ id: 'tab-2' }))
			expect(onClaimed).toHaveBeenCalledWith('editor', expect.objectContaining({ id: 'tab-2' }))
		})

		it('view:claimed from unknown tab still registers with synthetic metadata', () => {
			const { views, onClaimed } = setup()

			views.handleMessage(
				makeMessage({
					type: 'view:claimed',
					from: 'tab-unknown',
					payload: { name: 'editor', tabId: 'tab-unknown' },
				}),
			)

			expect(views.get('editor')).toEqual(
				expect.objectContaining({ id: 'tab-unknown', view: 'editor' }),
			)
			expect(onClaimed).toHaveBeenCalledWith(
				'editor',
				expect.objectContaining({ id: 'tab-unknown' }),
			)
		})

		it('view:release removes and fires onVacant', () => {
			const otherTab = makeTab({ id: 'tab-2' })
			const { views, onClaimed, onVacant } = setup({ tabs: [otherTab] })

			// First, simulate a remote claim
			views.handleMessage(
				makeMessage({
					type: 'view:claimed',
					from: 'tab-2',
					payload: { name: 'editor', tabId: 'tab-2' },
				}),
			)
			expect(views.has('editor')).toBe(true)
			onClaimed.mockClear()

			// Now release
			views.handleMessage(
				makeMessage({
					type: 'view:release',
					from: 'tab-2',
					payload: { name: 'editor' },
				}),
			)

			expect(views.get('editor')).toBeNull()
			expect(onVacant).toHaveBeenCalledWith('editor')
		})

		it('view:focus triggers window.focus if this tab holds that view', () => {
			const mockWin = installMockWindow()
			try {
				const { views } = setup()

				views.claim('editor')

				views.handleMessage(
					makeMessage({
						type: 'view:focus',
						from: 'tab-2',
						payload: { name: 'editor' },
					}),
				)

				expect(window.focus).toHaveBeenCalled()
			} finally {
				mockWin.restore()
			}
		})

		it('view:focus does NOT trigger window.focus if tab does not hold view', () => {
			const mockWin = installMockWindow()
			try {
				const { views } = setup()

				// tab-1 does NOT hold 'editor'
				views.handleMessage(
					makeMessage({
						type: 'view:focus',
						from: 'tab-2',
						payload: { name: 'editor' },
					}),
				)

				expect(window.focus).not.toHaveBeenCalled()
			} finally {
				mockWin.restore()
			}
		})
	})

	// ── loadFromRegistry() ────────────────────────────────────────────────

	describe('loadFromRegistry()', () => {
		it('populates in-memory from registry entries cross-referenced with presence', () => {
			const otherTab = makeTab({ id: 'tab-2' })
			const { views, registry } = setup({ tabs: [otherTab] })

			registry._store.set('editor', {
				tabId: 'tab-1',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})
			registry._store.set('dashboard', {
				tabId: 'tab-2',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})

			views.loadFromRegistry()

			expect(views.get('editor')).toEqual(expect.objectContaining({ id: 'tab-1' }))
			expect(views.get('dashboard')).toEqual(expect.objectContaining({ id: 'tab-2' }))
		})

		it('skips entries for dead tabs', () => {
			const { views, registry } = setup()

			registry._store.set('editor', {
				tabId: 'tab-dead',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})

			views.loadFromRegistry()

			expect(views.get('editor')).toBeNull()
		})
	})

	// ── validateAgainstPresence() ─────────────────────────────────────────

	describe('validateAgainstPresence()', () => {
		it('removes entries whose tab is dead, fires onVacant', () => {
			const deadTab = makeTab({ id: 'tab-dead' })
			const { views, registry, presence, onVacant } = setup({ tabs: [deadTab] })

			// Claim with dead tab present, then remove it from presence
			registry._store.set('editor', {
				tabId: 'tab-dead',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})
			views.loadFromRegistry()
			expect(views.has('editor')).toBe(true)

			// Now simulate tab-dead leaving by updating presence tabs
			presence.setTabs([])

			views.validateAgainstPresence()

			expect(views.get('editor')).toBeNull()
			expect(registry.delete).toHaveBeenCalledWith('editor')
			expect(onVacant).toHaveBeenCalledWith('editor')
		})
	})

	// ── cleanupForTab() ───────────────────────────────────────────────────

	describe('cleanupForTab()', () => {
		it('removes all views for a specific tab', () => {
			const otherTab = makeTab({ id: 'tab-2' })
			const { views, registry, onVacant } = setup({ tabs: [otherTab] })

			// Simulate tab-2 holding two views via loadFromRegistry
			registry._store.set('editor', {
				tabId: 'tab-2',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})
			registry._store.set('dashboard', {
				tabId: 'tab-2',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})
			views.loadFromRegistry()

			views.cleanupForTab('tab-2')

			expect(views.get('editor')).toBeNull()
			expect(views.get('dashboard')).toBeNull()
			expect(registry.delete).toHaveBeenCalledWith('editor')
			expect(registry.delete).toHaveBeenCalledWith('dashboard')
			expect(onVacant).toHaveBeenCalledWith('editor')
			expect(onVacant).toHaveBeenCalledWith('dashboard')
		})
	})

	// ── Reconciliation (wake-up) ──────────────────────────────────────────

	describe('reconciliation (wake-up)', () => {
		let mockDoc: ReturnType<typeof installMockDocument>

		beforeEach(() => {
			mockDoc = installMockDocument('hidden')
		})

		afterEach(() => {
			mockDoc.restore()
		})

		it('after visibility change to visible, reconcile runs', () => {
			const { views, registry } = setup()

			views.start()

			const handlers = mockDoc.getHandlers('visibilitychange')
			expect(handlers.length).toBeGreaterThan(0)

			// Trigger visibility change
			mockDoc.setVisibility('visible')
			handlers[0]()

			// reconcile was called -- it reads the registry
			// No assertion on internal, just verify no error
		})

		it('reconcile: our view taken while sleeping yields it', () => {
			const { views, registry, presence, onVacant } = setup()

			views.start()

			// Claim a view first
			views.claim('editor')
			onVacant.mockClear()

			// Simulate another tab taking our view while we were sleeping
			registry._store.set('editor', {
				tabId: 'tab-other',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})

			// Trigger wake-up
			mockDoc.setVisibility('visible')
			const handlers = mockDoc.getHandlers('visibilitychange')
			handlers[0]()

			// Our view should have been yielded
			expect(onVacant).toHaveBeenCalledWith('editor')
			expect(presence.setView).toHaveBeenCalledWith(null)
		})

		it('reconcile: dead tab view cleaned up', () => {
			const { views, registry, onVacant } = setup()

			views.start()

			// Seed registry with a dead tab's view
			registry._store.set('stale-view', {
				tabId: 'tab-dead',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})

			// Trigger wake-up
			mockDoc.setVisibility('visible')
			const handlers = mockDoc.getHandlers('visibilitychange')
			handlers[0]()

			// Dead tab's view should be cleaned up
			expect(registry.delete).toHaveBeenCalledWith('stale-view')
			expect(onVacant).toHaveBeenCalledWith('stale-view')
		})
	})

	// ── Query methods ─────────────────────────────────────────────────────

	describe('query methods', () => {
		it('get returns TabMeta or null', () => {
			const { views } = setup()

			expect(views.get('nonexistent')).toBeNull()

			views.claim('editor')
			expect(views.get('editor')).toEqual(expect.objectContaining({ id: 'tab-1' }))
		})

		it('listAll returns all view entries', () => {
			const otherTab = makeTab({ id: 'tab-2' })
			const { views, registry } = setup({ tabs: [otherTab] })

			views.claim('editor')

			registry._store.set('dashboard', {
				tabId: 'tab-2',
				claimedAt: Date.now(),
				epoch: 'epoch-1',
				meta: {},
			})
			views.loadFromRegistry()

			const all = views.listAll()
			expect(all).toEqual({
				editor: expect.objectContaining({ id: 'tab-1' }),
				dashboard: expect.objectContaining({ id: 'tab-2' }),
			})
		})

		it('has returns boolean', () => {
			const { views } = setup()

			expect(views.has('editor')).toBe(false)
			views.claim('editor')
			expect(views.has('editor')).toBe(true)
		})

		it('focus sends view:focus message', () => {
			const { views, channel } = setup()

			views.focus('editor')

			expect(channel.send).toHaveBeenCalledWith('view:focus', { name: 'editor' })
		})
	})

	// ── stop() ────────────────────────────────────────────────────────────

	describe('stop()', () => {
		it('removes visibility handler', () => {
			const mockDoc = installMockDocument()
			try {
				const { views } = setup()

				views.start()

				const handlersBefore = mockDoc.getHandlers('visibilitychange')
				expect(handlersBefore.length).toBe(1)

				views.stop()

				const handlersAfter = mockDoc.getHandlers('visibilitychange')
				expect(handlersAfter.length).toBe(0)
			} finally {
				mockDoc.restore()
			}
		})
	})
})
