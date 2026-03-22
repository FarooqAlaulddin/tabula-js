import { expect, test } from '@playwright/test'
import {
	destroyWorkspace,
	getEvents,
	getTabCount,
	getTabId,
	openTab,
	uniqueNs,
	waitForEvent,
	waitForTabCount,
} from '../helpers/tabula-page'

test.describe('Presence & Tab Discovery', () => {
	test('two tabs discover each other', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)

		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		expect(await getTabCount(pageA)).toBe(2)
		expect(await getTabCount(pageB)).toBe(2)
	})

	test('tab:join event fires when second tab connects', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		await openTab(pageA, ns)

		const pageB = await context.newPage()
		await openTab(pageB, ns)

		await waitForEvent(pageA, 'tab:join')
		const events = await getEvents(pageA)
		const joinEvents = events.filter((e) => e.type === 'tab:join')
		expect(joinEvents.length).toBeGreaterThanOrEqual(1)
	})

	test('tab:leave fires when tab is destroyed and closed', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)

		// destroy workspace on B, then close the page
		await destroyWorkspace(pageB)
		await pageB.close()

		// A should detect leave via heartbeat timeout
		await waitForEvent(pageA, 'tab:leave', 10000)
		await waitForTabCount(pageA, 1, 10000)
		expect(await getTabCount(pageA)).toBe(1)
	})

	test('tab ID persists across refresh (sessionStorage)', async ({ context }) => {
		const ns = uniqueNs()
		const page = await context.newPage()
		await openTab(page, ns)

		const idBefore = await getTabId(page)

		// reload page
		await page.goto(`/?ns=${ns}&heartbeat=200&timeout=1000`)
		await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', {
			timeout: 5000,
		})

		const idAfter = await getTabId(page)
		expect(idAfter).toBe(idBefore)
	})

	test('three tabs — close middle one, remaining two still see each other', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		const pageC = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await openTab(pageC, ns)

		// all three discover each other
		await waitForTabCount(pageA, 3)
		await waitForTabCount(pageB, 3)
		await waitForTabCount(pageC, 3)

		// close the middle tab (B)
		await destroyWorkspace(pageB)
		await pageB.close()

		// A and C should both drop to 2 tabs
		await waitForTabCount(pageA, 2, 10000)
		await waitForTabCount(pageC, 2, 10000)

		expect(await getTabCount(pageA)).toBe(2)
		expect(await getTabCount(pageC)).toBe(2)

		// verify A and C still see each other's IDs
		const idA = await getTabId(pageA)
		const idC = await getTabId(pageC)
		expect(idA).not.toBe(idC)

		const tabIdsFromA = await pageA.evaluate(() =>
			(window as any).__tabula.tabs.list().map((t: any) => t.id),
		)
		expect(tabIdsFromA).toContain(idA)
		expect(tabIdsFromA).toContain(idC)
	})
})
