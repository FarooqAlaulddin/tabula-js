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

	test('tab:leave fires on tab close', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)

		// close B
		await destroyWorkspace(pageB)
		await pageB.close()

		// A should detect leave
		await waitForEvent(pageA, 'tab:leave', 10000)
		await waitForTabCount(pageA, 1, 10000)
		expect(await getTabCount(pageA)).toBe(1)
	})

	test('tab ID persists across refresh', async ({ context }) => {
		const ns = uniqueNs()
		const pageB = await context.newPage()
		await openTab(pageB, ns)

		const idBefore = await getTabId(pageB)

		// reload B
		await pageB.reload()
		await pageB.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', {
			timeout: 5000,
		})

		// B should have the same tab ID (persisted in sessionStorage)
		const idAfter = await getTabId(pageB)
		expect(idAfter).toBe(idBefore)
	})
})
