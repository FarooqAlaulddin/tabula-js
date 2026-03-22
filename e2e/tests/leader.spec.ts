import { expect, test } from '@playwright/test'
import {
	destroyWorkspace,
	getLeaderTabId,
	isLeader,
	openTab,
	uniqueNs,
	waitForTabCount,
} from '../helpers/tabula-page'

test.describe('Leader Election', () => {
	test('single tab is always leader', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		await openTab(pageA, ns)

		expect(await isLeader(pageA)).toBe(true)
	})

	test('each tab elects a leader', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		// both tabs should have elected *some* leader
		const leaderFromA = await getLeaderTabId(pageA)
		const leaderFromB = await getLeaderTabId(pageB)
		expect(leaderFromA).not.toBeNull()
		expect(leaderFromB).not.toBeNull()
	})

	test('when leader closes, remaining tab becomes leader', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		await openTab(pageA, ns)

		// A is the only tab, so it's leader
		expect(await isLeader(pageA)).toBe(true)

		// open B
		const pageB = await context.newPage()
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)

		// close A (original leader)
		await destroyWorkspace(pageA)
		await pageA.close()

		// B should become leader
		await pageB.waitForFunction(() => (window as any).__tabula.isLeader() === true, {
			timeout: 10000,
		})
		expect(await isLeader(pageB)).toBe(true)
	})
})
