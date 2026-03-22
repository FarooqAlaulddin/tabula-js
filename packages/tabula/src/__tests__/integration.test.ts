import { createWorkspace } from '@tabula/tabula'
import type { Workspace } from '@tabula/tabula'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMockDocument, installMockStorage, installMockWindow } from './helpers'

interface TestState {
	theme: 'light' | 'dark'
	count: number
}

// ── Connected BroadcastChannel mock ──────────────────────────────────────
// Unlike the helpers' MockBroadcastChannel (which is isolated), this version
// automatically delivers postMessage to all OTHER instances with the same name.

interface ConnectedBC {
	name: string
	onmessage: ((ev: MessageEvent) => void) | null
	postMessage: ReturnType<typeof vi.fn>
	close: ReturnType<typeof vi.fn>
}

function installConnectedBroadcastChannel(): {
	instances: ConnectedBC[]
	restore: () => void
} {
	const instances: ConnectedBC[] = []
	const original = globalThis.BroadcastChannel
	;(globalThis as any).BroadcastChannel = class {
		name: string
		onmessage: ((ev: MessageEvent) => void) | null = null
		close = vi.fn()

		postMessage = vi.fn((data: unknown) => {
			// Deliver to all OTHER open instances with the same channel name
			for (const other of instances) {
				if (
					other !== (this as unknown as ConnectedBC) &&
					other.name === this.name &&
					other.onmessage
				) {
					other.onmessage({ data } as MessageEvent)
				}
			}
		})

		constructor(name: string) {
			this.name = name
			instances.push(this as unknown as ConnectedBC)
		}
	}

	return {
		instances,
		restore: () => {
			if (original) {
				;(globalThis as any).BroadcastChannel = original
			} else {
				delete (globalThis as any).BroadcastChannel
			}
		},
	}
}

describe('Integration: multi-tab scenarios', () => {
	let bcMock: ReturnType<typeof installConnectedBroadcastChannel>
	let storageMock: ReturnType<typeof installMockStorage>
	let docMock: ReturnType<typeof installMockDocument>
	let winMock: ReturnType<typeof installMockWindow>
	let uuidCounter: number

	beforeEach(() => {
		vi.useFakeTimers()
		bcMock = installConnectedBroadcastChannel()
		storageMock = installMockStorage()
		docMock = installMockDocument('visible')
		winMock = installMockWindow()
		uuidCounter = 0
		vi.stubGlobal('crypto', {
			randomUUID: () => {
				uuidCounter++
				return `tab-uuid-${uuidCounter}`
			},
		})
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
		bcMock.restore()
		storageMock.restore()
		docMock.restore()
		winMock.restore()
	})

	/**
	 * Create two workspaces in the same namespace, simulating two browser tabs.
	 * Each tab needs a unique tab ID, so we clear the sessionStorage tab-id
	 * between creations to force a new UUID generation.
	 */
	async function createTwoTabs(namespace = 'shared-ns'): Promise<{
		tabA: Workspace<TestState>
		tabB: Workspace<TestState>
	}> {
		// Tab A: first tab
		const tabA = createWorkspace<TestState>(namespace)
		// Advance to let tabA's init complete (waitForTabs 100ms + syncState 500ms)
		await vi.advanceTimersByTimeAsync(350)

		// Tab B: clear sessionStorage tab-id to get a new UUID for the second tab
		sessionStorage.removeItem('tabula:tab-id')

		const tabB = createWorkspace<TestState>(namespace)
		// Advance to let tabB's init complete (includes announce exchange)
		await vi.advanceTimersByTimeAsync(350)

		return { tabA, tabB }
	}

	describe('state synchronization', () => {
		it('state set in tab A arrives in tab B', async () => {
			const { tabA, tabB } = await createTwoTabs()

			tabA.state.set('theme', 'dark')
			// Give time for BC message propagation
			await vi.advanceTimersByTimeAsync(50)

			expect(tabB.state.get('theme')).toBe('dark')

			tabA.destroy()
			tabB.destroy()
		})

		it('state set in tab B arrives in tab A', async () => {
			const { tabA, tabB } = await createTwoTabs()

			tabB.state.set('count', 99)
			await vi.advanceTimersByTimeAsync(100)

			expect(tabA.state.get('count')).toBe(99)

			tabA.destroy()
			tabB.destroy()
		})
	})

	describe('leader election', () => {
		it('leader is the first tab (oldest)', async () => {
			const { tabA, tabB } = await createTwoTabs()

			// Tab A was created first, so it should be leader
			expect(tabA.isLeader()).toBe(true)
			expect(tabB.isLeader()).toBe(false)

			tabA.destroy()
			tabB.destroy()
		})
	})

	describe('presence events', () => {
		it('tab:join event fires when second tab connects', async () => {
			// Create tab A first
			const tabA = createWorkspace<TestState>('shared-ns')
			await vi.advanceTimersByTimeAsync(350)

			const joinCb = vi.fn()
			tabA.on('tab:join', joinCb)

			// Create tab B
			sessionStorage.removeItem('tabula:tab-id')
			const tabB = createWorkspace<TestState>('shared-ns')
			await vi.advanceTimersByTimeAsync(350)

			expect(joinCb).toHaveBeenCalled()
			const joinedTab = joinCb.mock.calls[0][0]
			expect(joinedTab.id).toBe(tabB.tabs.current().id)

			tabA.destroy()
			tabB.destroy()
		})
	})

	describe('views across tabs', () => {
		it('claim in tab A, views.has in tab B returns true', async () => {
			const { tabA, tabB } = await createTwoTabs()

			tabA.claim('editor')
			// Give time for the view:claimed message to propagate
			await vi.advanceTimersByTimeAsync(50)

			expect(tabB.views.has('editor')).toBe(true)

			tabA.destroy()
			tabB.destroy()
		})
	})

	describe('tab departure', () => {
		it('destroying tab A causes tab:leave event in tab B', async () => {
			const { tabA, tabB } = await createTwoTabs()

			const leaveCb = vi.fn()
			tabB.on('tab:leave', leaveCb)

			const tabAId = tabA.tabs.current().id

			// Destroy tab A — this broadcasts tab:leave
			tabA.destroy()
			await vi.advanceTimersByTimeAsync(50)

			expect(leaveCb).toHaveBeenCalledWith(expect.objectContaining({ id: tabAId }))

			tabB.destroy()
		})
	})
})
