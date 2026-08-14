import { createMockWorkspace, createTestCluster } from '@tabula/testing'
import { describe, expect, it, vi } from 'vitest'

interface TestState {
	theme: 'light' | 'dark'
	count: number
}

describe('createMockWorkspace', () => {
	it('creates a workspace with a unique tab ID', () => {
		const app = createMockWorkspace<TestState>()
		const tab = app.tabs.current()
		expect(tab.id).toMatch(/^mock-/)
		expect(tab.visible).toBe(true)
	})

	it('sets and gets state', () => {
		const app = createMockWorkspace<TestState>()
		app.state.set('theme', 'dark')
		expect(app.state.get('theme')).toBe('dark')
	})

	it('notifies state listeners', () => {
		const app = createMockWorkspace<TestState>()
		const cb = vi.fn()
		app.state.on('theme', cb)
		app.state.set('theme', 'dark')
		expect(cb).toHaveBeenCalledWith('dark')
	})

	it('notifies wildcard listeners', () => {
		const app = createMockWorkspace<TestState>()
		const cb = vi.fn()
		app.state.on('*', cb)
		app.state.set('count', 42)
		expect(cb).toHaveBeenCalledWith('count', 42)
	})

	it('deletes state', () => {
		const app = createMockWorkspace<TestState>()
		app.state.set('theme', 'dark')
		app.state.delete('theme')
		expect(app.state.get('theme')).toBeUndefined()
	})

	it('claims a view', async () => {
		const app = createMockWorkspace<TestState>()
		const cb = vi.fn()
		app.on('view:claimed', cb)
		const result = await app.claim('writer')
		expect(result.status).toBe('claimed')
		expect(app.views.has('writer')).toBe(true)
		expect(cb).toHaveBeenCalledWith(expect.objectContaining({ name: 'writer' }))
	})

	it('throws on double claim', async () => {
		const app = createMockWorkspace<TestState>()
		await app.claim('writer')
		await expect(app.claim('editor')).rejects.toThrow('already owns')
	})

	it('is leader by default in standalone mode', () => {
		const app = createMockWorkspace<TestState>()
		expect(app.isLeader()).toBe(true)
	})

	it('runs onLeader setup immediately when leader', () => {
		const app = createMockWorkspace<TestState>()
		const setup = vi.fn(() => undefined)
		app.onLeader(setup)
		expect(setup).toHaveBeenCalled()
	})

	it('unsubscribes state listeners', () => {
		const app = createMockWorkspace<TestState>()
		const cb = vi.fn()
		const unsub = app.state.on('theme', cb)
		unsub()
		app.state.set('theme', 'dark')
		expect(cb).not.toHaveBeenCalled()
	})

	it('cleans up on destroy', () => {
		const app = createMockWorkspace<TestState>()
		const cleanup = vi.fn()
		app.onLeader(() => cleanup)
		app.destroy()
		expect(cleanup).toHaveBeenCalled()
	})
})

describe('createTestCluster', () => {
	it('returns to an empty steady state after 1,000 claim and lifecycle cycles', async () => {
		const cluster = createTestCluster<TestState>('stress')
		for (let index = 0; index < 1_000; index++) {
			const tab = cluster.createTab()
			const result = await tab.claim('writer')
			expect(result.status).toBe('claimed')
			if (result.status === 'claimed') result.handle.release()
			expect(tab.views.list()).toEqual({})
			tab.destroy()
			expect(tab.status().lifecycle).toBe('destroyed')
		}

		const probe = cluster.createTab()
		expect(probe.tabs.list()).toHaveLength(1)
		expect(probe.views.list()).toEqual({})
	})

	it('creates multiple tabs that share state', () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		tabA.state.set('theme', 'dark')
		expect(tabB.state.get('theme')).toBe('dark')
	})

	it('elects the oldest tab as leader', () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		expect(tabA.isLeader()).toBe(true)
		expect(tabB.isLeader()).toBe(false)
	})

	it('propagates state changes bidirectionally', () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		tabB.state.set('count', 42)
		expect(tabA.state.get('count')).toBe(42)
	})

	it('notifies state listeners across tabs', () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		const cb = vi.fn()
		tabB.state.on('theme', cb)
		tabA.state.set('theme', 'light')
		expect(cb).toHaveBeenCalledWith('light')
	})

	it('propagates view claims across tabs', async () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		const cb = vi.fn()
		tabA.on('view:claimed', cb)
		await tabB.claim('writer')

		expect(cb).toHaveBeenCalledWith(expect.objectContaining({ name: 'writer' }))
		expect(tabA.views.has('writer')).toBe(true)
	})

	it('returns one winner and one conflict for a shared view', async () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		const [first, second] = await Promise.all([tabA.claim('writer'), tabB.claim('writer')])
		expect(first.status).toBe('claimed')
		expect(second).toEqual({
			status: 'conflict',
			owner: expect.objectContaining({ id: tabA.tabs.current().id }),
		})
	})

	it('fences a stale testing handle from a replacement claim', async () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()
		const first = await tabA.claim('writer')
		if (first.status !== 'claimed') throw new Error('Expected the first claim to win.')
		first.handle.release()
		const replacement = await tabB.claim('writer')
		expect(replacement.status).toBe('claimed')

		first.handle.release()
		expect(tabA.views.get('writer')?.id).toBe(tabB.tabs.current().id)
	})

	it('emits tab:join when new tab joins', () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()

		const cb = vi.fn()
		tabA.on('tab:join', cb)

		cluster.createTab()
		expect(cb).toHaveBeenCalled()
	})

	it('lists all tabs in the cluster', () => {
		const cluster = createTestCluster<TestState>('test')
		cluster.createTab()
		cluster.createTab()
		const tabC = cluster.createTab()

		expect(tabC.tabs.list()).toHaveLength(3)
	})

	it('returns leader tab metadata', () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		const leader = tabB.tabs.leader()
		expect(leader).not.toBeNull()
		expect(leader?.id).toBe(tabA.tabs.current().id)
	})

	it('deletes state across tabs', () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		tabA.state.set('theme', 'dark')
		tabA.state.delete('theme')
		expect(tabB.state.get('theme')).toBeUndefined()
	})
})
