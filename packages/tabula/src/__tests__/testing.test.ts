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

	it('claims a view', () => {
		const app = createMockWorkspace<TestState>()
		const cb = vi.fn()
		app.on('view:claimed', cb)
		app.claim('writer')
		expect(app.views.has('writer')).toBe(true)
		expect(cb).toHaveBeenCalledWith(expect.objectContaining({ name: 'writer' }))
	})

	it('throws on double claim', () => {
		const app = createMockWorkspace<TestState>()
		app.claim('writer')
		expect(() => app.claim('editor')).toThrow('already holds')
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

	it('propagates view claims across tabs', () => {
		const cluster = createTestCluster<TestState>('test')
		const tabA = cluster.createTab()
		const tabB = cluster.createTab()

		const cb = vi.fn()
		tabA.on('view:claimed', cb)
		tabB.claim('writer')

		expect(cb).toHaveBeenCalledWith(expect.objectContaining({ name: 'writer' }))
		expect(tabA.views.has('writer')).toBe(true)
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
