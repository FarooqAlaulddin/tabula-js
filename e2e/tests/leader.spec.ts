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

	test('each tab in a pair elects some leader (both have non-null leader)', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		const leaderFromA = await getLeaderTabId(pageA)
		const leaderFromB = await getLeaderTabId(pageB)

		expect(leaderFromA).not.toBeNull()
		expect(leaderFromB).not.toBeNull()
	})

	test('leadership transfers when leader tab closes — remaining tab becomes leader', async ({
		context,
	}) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		await openTab(pageA, ns)

		// A is the only tab, so it must be leader
		expect(await isLeader(pageA)).toBe(true)

		// open B, wait for mutual discovery
		const pageB = await context.newPage()
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		// close A (the leader)
		await destroyWorkspace(pageA)
		await pageA.close()

		// B should become leader after detecting A's departure
		await pageB.waitForFunction(() => (window as any).__tabula.isLeader() === true, {
			timeout: 10000,
		})
		expect(await isLeader(pageB)).toBe(true)
	})

	test('after leader refresh, onLeader callback resumes (notification count keeps incrementing)', async ({
		context,
	}) => {
		const ns = uniqueNs()

		// Open tab A — becomes leader, onLeader starts incrementing notificationCount
		const pageA = await context.newPage()
		await openTab(pageA, ns)
		expect(await isLeader(pageA)).toBe(true)

		// Wait for the onLeader interval to fire a few times (1s interval in fixture)
		// Read badge value, wait, read again, verify it increased
		await pageA.waitForFunction(
			() => Number(document.getElementById('notif-badge')?.dataset.count) >= 1,
			{ timeout: 10000 },
		)
		const countBefore = await pageA.evaluate(() =>
			Number(document.getElementById('notif-badge')?.dataset.count),
		)
		expect(countBefore).toBeGreaterThanOrEqual(1)

		// Open tab B so the workspace persists across refresh
		const pageB = await context.newPage()
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		// Refresh tab A — it should rejoin and eventually one tab becomes leader
		const urlA = pageA.url()
		await pageA.goto(urlA)
		await pageA.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', {
			timeout: 5000,
		})

		// Wait for leader election to settle and onLeader to resume incrementing
		// Check whichever tab is leader — its badge should keep going up
		await pageA.waitForFunction(() => (window as any).__tabula.tabs.leader() !== null, {
			timeout: 5000,
		})
		await pageB.waitForFunction(() => (window as any).__tabula.tabs.leader() !== null, {
			timeout: 5000,
		})

		// Wait enough time for the onLeader interval (1s) to fire several more times
		// Then check that at least one tab's badge is increasing
		// Poll until the notificationCount state value exceeds what we saw before
		await pageA.waitForFunction(
			(prevCount) => {
				const count = (window as any).__tabula.state.get('notificationCount') ?? 0
				return count > prevCount
			},
			countBefore,
			{ timeout: 10000 },
		)

		const countAfter = await pageA.evaluate(
			() => (window as any).__tabula.state.get('notificationCount') ?? 0,
		)
		expect(countAfter).toBeGreaterThan(countBefore)
	})
})
