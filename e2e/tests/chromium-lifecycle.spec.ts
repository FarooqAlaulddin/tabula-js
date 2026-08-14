import { expect, test } from '@playwright/test'
import {
	claimView,
	destroyWorkspace,
	hasView,
	isLeader,
	openTab,
	uniqueNs,
} from '../helpers/tabula-page'

test.describe('Chromium lifecycle controls', () => {
	test('a frozen follower resumes without callbacks or identity churn', async ({ context }) => {
		const ns = uniqueNs('follower-frozen')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		await Promise.all([openTab(pageA, ns), openTab(pageB, ns)])
		await expect.poll(async () => [await isLeader(pageA), await isLeader(pageB)]).toContain(true)
		const aIsLeader = await isLeader(pageA)
		const holder = aIsLeader ? pageA : pageB
		const follower = aIsLeader ? pageB : pageA
		const followerId = await follower.evaluate(() => (window as any).__tabula.tabs.current().id)
		expect(await follower.evaluate(() => (window as any).__leaderLifecycle.setupCount)).toBe(0)

		const session = await context.newCDPSession(follower)
		await session.send('Page.setWebLifecycleState', { state: 'frozen' })
		await holder.waitForTimeout(1200)
		expect(await isLeader(holder)).toBe(true)
		await session.send('Page.setWebLifecycleState', { state: 'active' })
		await follower.waitForFunction(() => (window as any).__tabula.status().lifecycle === 'ready')
		expect(await follower.evaluate(() => (window as any).__tabula.tabs.current().id)).toBe(
			followerId,
		)
		expect(await follower.evaluate(() => (window as any).__leaderLifecycle.setupCount)).toBe(0)
	})

	test('a frozen leader is not replaced while its lock remains held', async ({ context }) => {
		const ns = uniqueNs('leader-frozen')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		await Promise.all([openTab(pageA, ns), openTab(pageB, ns)])
		await expect.poll(async () => [await isLeader(pageA), await isLeader(pageB)]).toContain(true)

		const aIsLeader = await isLeader(pageA)
		const holder = aIsLeader ? pageA : pageB
		const follower = aIsLeader ? pageB : pageA
		const session = await context.newCDPSession(holder)
		await session.send('Page.setWebLifecycleState', { state: 'frozen' })

		await follower.waitForTimeout(1200)
		expect(await isLeader(follower)).toBe(false)
		const lockName = `tabula-js:v1:${encodeURIComponent(ns)}:leader`
		const lockSnapshot = await follower.evaluate(async (name) => {
			const snapshot = await navigator.locks.query()
			return {
				held: snapshot.held?.filter((lock) => lock.name === name).length ?? 0,
				pending: snapshot.pending?.filter((lock) => lock.name === name).length ?? 0,
			}
		}, lockName)
		expect(lockSnapshot).toEqual({ held: 1, pending: 1 })

		await session.send('Page.setWebLifecycleState', { state: 'active' })
		await destroyWorkspace(holder)
		await expect.poll(() => isLeader(follower), { timeout: 10000 }).toBe(true)
	})

	test('a frozen view owner is not replaced while its lock remains held', async ({ context }) => {
		const ns = uniqueNs('view-frozen')
		const holder = await context.newPage()
		const contender = await context.newPage()
		await Promise.all([openTab(holder, ns), openTab(contender, ns)])
		const claimed = await claimView(holder, 'editor')
		expect(claimed.status).toBe('claimed')
		await contender.waitForFunction(() => (window as any).__tabula.views.has('editor'))

		const session = await context.newCDPSession(holder)
		await session.send('Page.setWebLifecycleState', { state: 'frozen' })
		await contender.waitForTimeout(1200)
		expect((await claimView(contender, 'editor')).status).toBe('conflict')
		expect(await hasView(contender, 'editor')).toBe(true)
		const held = await contender.evaluate(
			async (name) => {
				const snapshot = await navigator.locks.query()
				return snapshot.held?.filter((lock) => lock.name === name).length ?? 0
			},
			`tabula-js:v1:${encodeURIComponent(ns)}:view:editor`,
		)
		expect(held).toBe(1)

		await session.send('Page.setWebLifecycleState', { state: 'active' })
	})
})
