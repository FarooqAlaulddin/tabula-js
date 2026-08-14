import { expect, test } from '@playwright/test'
import {
	claimView,
	destroyWorkspace,
	getTabId,
	isLeader,
	openTab,
	uniqueNs,
	waitForTabCount,
} from '../helpers/tabula-page'

test.describe('Portable adversarial coordination', () => {
	test('destroy before ready is terminal and releases queued work', async ({ page }) => {
		const ns = uniqueNs('destroy-before-ready')
		await page.goto('/deferred.html')
		await page.evaluate((namespace) => (window as any).__createAndDestroy(namespace), ns)
		await expect(page.locator('#status')).toHaveText('done')
		const result = await page.evaluate(() => {
			const { queued: _queued, ...snapshot } = (window as any).__destroyResult
			return snapshot
		})
		expect(result).toEqual({
			lifecycle: 'destroyed',
			readyError: expect.objectContaining({ name: 'WorkspaceDestroyedError' }),
			mutationError: expect.objectContaining({ name: 'WorkspaceDestroyedError' }),
		})
		const locks = await page.evaluate(async (namespace) => {
			const prefix = `tabula-js:v1:${encodeURIComponent(namespace)}:`
			const snapshot = await navigator.locks.query()
			return [...(snapshot.held ?? []), ...(snapshot.pending ?? [])].filter((lock) =>
				lock.name?.startsWith(prefix),
			).length
		}, ns)
		expect(locks).toBe(0)
	})

	test('eight-tab join and claim storm converges on one leader and view owner', async ({
		context,
	}) => {
		const ns = uniqueNs('combined-storm')
		const pages = await Promise.all(Array.from({ length: 8 }, () => context.newPage()))
		await Promise.all(pages.map((page) => openTab(page, ns)))
		await Promise.all(pages.map((page) => waitForTabCount(page, 8, 10000)))

		const claims = await Promise.all(pages.map((page) => claimView(page, 'editor')))
		const winner = claims.findIndex((claim) => claim.status === 'claimed')
		expect(winner).toBeGreaterThanOrEqual(0)
		expect(claims.filter((claim) => claim.status === 'claimed')).toHaveLength(1)
		expect(claims.filter((claim) => claim.status === 'conflict')).toHaveLength(7)
		const ownerId = claims[winner].ownerId

		await Promise.all(
			pages.map((page) =>
				page.waitForFunction(
					(expected) => (window as any).__tabula.views.get('editor')?.id === expected,
					ownerId,
				),
			),
		)
		expect((await Promise.all(pages.map(isLeader))).filter(Boolean)).toHaveLength(1)

		const departing = pages.filter((_, index) => index !== winner).slice(0, 4)
		await Promise.all(departing.map((page) => destroyWorkspace(page)))
		await Promise.all(departing.map((page) => page.close()))
		const survivors = pages.filter((page) => !departing.includes(page))
		await Promise.all(survivors.map((page) => waitForTabCount(page, 4, 10000)))
		expect((await Promise.all(survivors.map(isLeader))).filter(Boolean)).toHaveLength(1)
		expect(
			await Promise.all(
				survivors.map((page) =>
					page.evaluate(() => (window as any).__tabula.views.get('editor')?.id ?? null),
				),
			),
		).toEqual(Array(4).fill(ownerId))
	})

	test('simultaneous leader and view-owner termination transfers both authorities', async ({
		context,
	}) => {
		const ns = uniqueNs('dual-authority-loss')
		const pages = await Promise.all(Array.from({ length: 3 }, () => context.newPage()))
		await Promise.all(pages.map((page) => openTab(page, ns)))
		await Promise.all(pages.map((page) => waitForTabCount(page, 3)))
		const leaderIndex = (await Promise.all(pages.map(isLeader))).findIndex(Boolean)
		expect(leaderIndex).toBeGreaterThanOrEqual(0)
		const ownerIndex = pages.findIndex((_, index) => index !== leaderIndex)
		const survivorIndex = pages.findIndex(
			(_, index) => index !== leaderIndex && index !== ownerIndex,
		)
		const owner = pages[ownerIndex]
		const survivor = pages[survivorIndex]
		expect((await claimView(owner, 'editor')).status).toBe('claimed')
		await survivor.waitForFunction(() => (window as any).__tabula.views.has('editor'))

		await Promise.all([
			pages[leaderIndex].close({ runBeforeUnload: false }),
			owner.close({ runBeforeUnload: false }),
		])
		await expect.poll(() => isLeader(survivor), { timeout: 10000 }).toBe(true)
		await survivor.waitForFunction(() => !(window as any).__tabula.views.has('editor'), {
			timeout: 10000,
		})
		expect((await claimView(survivor, 'editor')).status).toBe('claimed')
	})

	test('four-tab refresh storm preserves distinct context identities and converges', async ({
		context,
	}) => {
		const ns = uniqueNs('refresh-storm')
		const pages = await Promise.all(Array.from({ length: 4 }, () => context.newPage()))
		await Promise.all(pages.map((page) => openTab(page, ns)))
		await Promise.all(pages.map((page) => waitForTabCount(page, 4)))
		const before = await Promise.all(pages.map(getTabId))
		expect(new Set(before).size).toBe(4)

		await Promise.all(pages.map((page) => page.reload()))
		await Promise.all(
			pages.map((page) =>
				page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready'),
			),
		)
		await Promise.all(pages.map((page) => waitForTabCount(page, 4, 10000)))
		expect(await Promise.all(pages.map(getTabId))).toEqual(before)
		expect((await Promise.all(pages.map(isLeader))).filter(Boolean)).toHaveLength(1)
	})

	test('suspension past the presence timeout recovers membership and queued state', async ({
		context,
	}) => {
		const ns = uniqueNs('timeout-recovery')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		for (const page of [pageA, pageB]) {
			await page.goto(`/?ns=${ns}&heartbeat=100&timeout=300&readyTimeout=500`)
			await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready')
		}
		await Promise.all([waitForTabCount(pageA, 2), waitForTabCount(pageB, 2)])

		await pageA.evaluate(() => {
			window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
			;(window as any).__tabula.state.set('queued-while-suspended', 'restored')
		})
		await waitForTabCount(pageB, 1, 5000)
		await pageA.evaluate(() => {
			window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
		})
		await Promise.all([waitForTabCount(pageA, 2, 10000), waitForTabCount(pageB, 2, 10000)])
		await pageB.waitForFunction(
			() => (window as any).__tabula.state.get('queued-while-suspended') === 'restored',
		)
	})

	test('unsupported protocol traffic emits one recovery signal and cannot mutate state', async ({
		page,
	}) => {
		const ns = uniqueNs('mixed-protocol')
		await openTab(page, ns)
		await page.evaluate((namespace) => {
			const channel = new BroadcastChannel(`tabula:${namespace}`)
			const base = {
				protocol: { major: 2, revision: 0, minRevision: 0 },
				type: 'state:set',
				from: { tabId: 'future-tab', instanceId: 'future-instance' },
				sentAt: Date.now(),
				payload: { key: 'unsafe', value: 'must-not-apply' },
			}
			channel.postMessage({ ...base, id: 'future:1' })
			channel.postMessage({ ...base, id: 'future:2' })
			channel.close()
		}, ns)
		await page.waitForFunction(
			() =>
				(window as any).__tabulaEvents.filter(
					(event: any) => event.type === 'protocol:incompatible',
				).length === 1,
		)
		expect(await page.evaluate(() => (window as any).__tabula.state.get('unsafe'))).toBeUndefined()
		expect(
			await page.evaluate(
				() =>
					(window as any).__tabulaEvents.find(
						(event: any) => event.type === 'protocol:incompatible',
					)?.recovery,
			),
		).toBe('Save work and reload all application tabs.')
	})
})
