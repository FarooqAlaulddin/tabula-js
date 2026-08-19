import { expect, test } from '@playwright/test'
import { getTabId, openTab, uniqueNs } from '../helpers/tabula-page'

test.describe('Lifecycle and tab identity', () => {
	test('an opener-created tab repairs its copied ID and preserves the repair on refresh', async ({
		context,
	}) => {
		const ns = uniqueNs('opener-identity')
		const opener = await context.newPage()
		await openTab(opener, ns)
		const openerId = await getTabId(opener)

		const popupPromise = context.waitForEvent('page')
		await opener.evaluate((namespace) => {
			window.open(`/?ns=${namespace}&heartbeat=200&timeout=1000`)
		}, ns)
		const popup = await popupPromise
		await popup.waitForFunction(() => document.getElementById('status')?.textContent === 'ready')

		const repairedId = await getTabId(popup)
		expect(repairedId).not.toBe(openerId)

		await popup.reload()
		await popup.waitForFunction(() => document.getElementById('status')?.textContent === 'ready')
		expect(await getTabId(popup)).toBe(repairedId)
	})

	test('a duplicated session candidate is repaired before ready', async ({ context }) => {
		const ns = uniqueNs('duplicate-identity')
		const pageA = await context.newPage()
		await openTab(pageA, ns)
		const idA = await getTabId(pageA)

		const pageB = await context.newPage()
		await pageB.addInitScript((candidateId) => {
			sessionStorage.setItem('tabula:tab-id', candidateId)
		}, idA)
		await openTab(pageB, ns)

		expect(await getTabId(pageB)).not.toBe(idA)
	})

	test('persisted pagehide suspends and pageshow resumes the same workspace', async ({ page }) => {
		const ns = uniqueNs('bfcache')
		await openTab(page, ns)
		const idBefore = await getTabId(page)
		const setupCountBefore = await page.evaluate(() => (window as any).__leaderLifecycle.setupCount)

		await page.evaluate(() => {
			window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
		})
		await expect
			.poll(() => page.evaluate(() => (window as any).__tabula.status().lifecycle))
			.toBe('bfcache-suspended')

		await page.evaluate(() => {
			;(window as any).__tabula.state.set('queued-during-suspension', true)
			window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
		})
		await expect
			.poll(() => page.evaluate(() => (window as any).__tabula.status().lifecycle))
			.toBe('ready')

		expect(await getTabId(page)).toBe(idBefore)
		expect(
			await page.evaluate(() => (window as any).__tabula.state.get('queued-during-suspension')),
		).toBe(true)
		await expect
			.poll(() => page.evaluate(() => (window as any).__leaderLifecycle.setupCount))
			.toBe(setupCountBefore + 1)
	})
})
