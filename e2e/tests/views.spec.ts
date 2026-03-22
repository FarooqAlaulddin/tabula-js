import { expect, test } from '@playwright/test'
import {
	claimView,
	destroyWorkspace,
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

		await pageA.waitForFunction(() => (window as any).__tabula.views.has('preview'), {
			timeout: 5000,
		})

		const viewsA = await getViews(pageA)
		expect(Object.keys(viewsA)).toContain('editor')
		expect(Object.keys(viewsA)).toContain('preview')
	})

	test('double claim throws', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		await openTab(pageA, ns)

		await claimView(pageA, 'editor')

		const error = await pageA.evaluate(async () => {
			try {
				;(window as any).__tabula.claim('preview')
				return null
			} catch (e: any) {
				return e.message
			}
		})

		expect(error).toContain('already holds')
	})

	test('view becomes vacant on tab close', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageB, 2)

		await claimView(pageA, 'editor')
		await pageB.waitForFunction(() => (window as any).__tabula.views.has('editor'), {
			timeout: 5000,
		})

		// close A
		await destroyWorkspace(pageA)
		await pageA.close()

		// B should see the view become vacant
		await pageB.waitForFunction(() => !(window as any).__tabula.views.has('editor'), {
			timeout: 10000,
		})
		expect(await hasView(pageB, 'editor')).toBe(false)
	})
})
