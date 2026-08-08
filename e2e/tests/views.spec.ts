import { expect, test } from '@playwright/test'
import {
	claimView,
	destroyWorkspace,
	getEvents,
	getViews,
	hasView,
	openTab,
	uniqueNs,
	waitForEvent,
	waitForTabCount,
} from '../helpers/tabula-page'

test.describe('Views', () => {
	test('claim registers a view visible to other tabs', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)

		await claimView(pageA, 'editor')

		await pageB.waitForFunction(() => (window as any).__tabula.views.has('editor'), {
			timeout: 5000,
		})
		expect(await hasView(pageB, 'editor')).toBe(true)
	})

	test('multiple tabs claim different views', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		await claimView(pageA, 'editor')
		await claimView(pageB, 'preview')

		// wait for both to see each other's views
		await pageA.waitForFunction(() => (window as any).__tabula.views.has('preview'), {
			timeout: 5000,
		})
		await pageB.waitForFunction(() => (window as any).__tabula.views.has('editor'), {
			timeout: 5000,
		})

		const viewsA = await getViews(pageA)
		expect(Object.keys(viewsA)).toContain('editor')
		expect(Object.keys(viewsA)).toContain('preview')

		const viewsB = await getViews(pageB)
		expect(Object.keys(viewsB)).toContain('editor')
		expect(Object.keys(viewsB)).toContain('preview')
	})

	test('double claim throws', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		await openTab(pageA, ns)

		await claimView(pageA, 'editor')

		// Wait for claim to be fully processed
		await pageA.waitForFunction(() => (window as any).__tabula.tabs.current().view === 'editor', {
			timeout: 3000,
		})

		// attempting to claim a second view should throw
		const error = await pageA.evaluate(() => {
			try {
				;(window as any).__tabula.claim('preview')
				return null
			} catch (e: any) {
				return e.message
			}
		})

		expect(error).not.toBeNull()
		expect(error).toContain('already holds')
	})

	test('view becomes vacant on tab close', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		await claimView(pageA, 'editor')
		await pageB.waitForFunction(() => (window as any).__tabula.views.has('editor'), {
			timeout: 5000,
		})

		// close A which holds the view
		await destroyWorkspace(pageA)
		await pageA.close()

		// B should see the view become vacant
		await pageB.waitForFunction(() => !(window as any).__tabula.views.has('editor'), {
			timeout: 10000,
		})
		expect(await hasView(pageB, 'editor')).toBe(false)
	})

	test('view claim via companion page (claim.html)', async ({ context }) => {
		const ns = uniqueNs()
		const viewName = 'settings'

		// open the dashboard tab (index.html)
		const dashboard = await context.newPage()
		await openTab(dashboard, ns)

		// open a second tab navigated to claim.html with URL params
		const claimPage = await context.newPage()
		await claimPage.goto(`/claim.html?ns=${ns}&view=${viewName}&heartbeat=200&timeout=1000`)
		await claimPage.waitForFunction(
			() => document.getElementById('status')?.textContent === 'claimed',
			{ timeout: 5000 },
		)

		// wait for mutual discovery
		await waitForTabCount(dashboard, 2)

		// dashboard should see the claimed view
		await dashboard.waitForFunction((name) => (window as any).__tabula.views.has(name), viewName, {
			timeout: 5000,
		})
		expect(await hasView(dashboard, viewName)).toBe(true)

		// verify the view is held by the claim page's tab ID
		const claimTabId = await claimPage.evaluate(() => (window as any).__tabula.tabs.current().id)
		const viewOwner = await dashboard.evaluate((name) => {
			const owner = (window as any).__tabula.views.get(name)
			return owner ? owner.id : null
		}, viewName)
		expect(viewOwner).toBe(claimTabId)
	})

	test('view:conflict fires when two tabs try to claim same view', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		// A claims 'editor' first
		await claimView(pageA, 'editor')
		await pageB.waitForFunction(() => (window as any).__tabula.views.has('editor'), {
			timeout: 5000,
		})

		// B tries to claim 'editor' — the internal claim returns false and fires view:conflict
		await pageB.evaluate(() => {
			;(window as any).__tabula.claim('editor')
		})

		// Wait for the view:conflict event on B
		await waitForEvent(pageB, 'view:conflict')
		const events = await getEvents(pageB)
		const conflictEvents = events.filter((e) => e.type === 'view:conflict')
		expect(conflictEvents.length).toBeGreaterThanOrEqual(1)

		// A should still hold the view
		expect(await hasView(pageA, 'editor')).toBe(true)
		const views = await getViews(pageA)
		const editorTabId = (views as any).editor?.id
		const aTabId = await pageA.evaluate(() => (window as any).__tabula.tabs.current().id)
		expect(editorTabId).toBe(aTabId)
	})

	test('focus() requests window focus on the view holder', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		// A claims 'editor'
		await claimView(pageA, 'editor')
		await pageB.waitForFunction(() => (window as any).__tabula.views.has('editor'), {
			timeout: 5000,
		})

		expect(await pageA.evaluate(() => (window as any).__focusCallCount)).toBe(0)
		expect(await pageB.evaluate(() => (window as any).__focusCallCount)).toBe(0)

		// B sends the request; only A, the holder, should call window.focus().
		await pageB.evaluate(() => (window as any).__tabula.focus('editor'))
		await pageA.waitForFunction(() => (window as any).__focusCallCount === 1)

		expect(await pageA.evaluate(() => (window as any).__focusCallCount)).toBe(1)
		expect(await pageB.evaluate(() => (window as any).__focusCallCount)).toBe(0)
	})
})
