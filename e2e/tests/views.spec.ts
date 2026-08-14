import { expect, test } from '@playwright/test'
import {
	claimView,
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
		const error = await pageA.evaluate(async () => {
			try {
				await (window as any).__tabula.claim('preview')
				return null
			} catch (e: any) {
				return e.message
			}
		})

		expect(error).not.toBeNull()
		expect(error).toContain('already owns')
	})

	test('abrupt tab close releases authority and leaves no registry ghost', async ({ context }) => {
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

		// Close without an explicit workspace destroy call.
		await pageA.close()

		// B should see the view become vacant
		await pageB.waitForFunction(() => !(window as any).__tabula.views.has('editor'), {
			timeout: 10000,
		})
		expect(await hasView(pageB, 'editor')).toBe(false)
		expect(
			await pageB.evaluate(
				(namespace) => localStorage.getItem(`tabula:${namespace}:view:editor`),
				ns,
			),
		).toBeNull()
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
		const result = await pageB.evaluate(async () => {
			const claim = await (window as any).__tabula.claim('editor')
			return { status: claim.status, ownerId: claim.owner?.id ?? null }
		})
		expect(result.status).toBe('conflict')

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

	test('eight simultaneous claimers produce one owner and one converged projection', async ({
		context,
	}) => {
		const ns = uniqueNs('view-contention')
		const pages = await Promise.all(Array.from({ length: 8 }, () => context.newPage()))
		await Promise.all(pages.map((page) => openTab(page, ns)))

		const results = await Promise.all(pages.map((page) => claimView(page, 'editor')))
		const winners = results.filter((result) => result.status === 'claimed')
		expect(winners).toHaveLength(1)
		const winnerId = winners[0].ownerId
		expect(winnerId).not.toBeNull()
		expect(results.filter((result) => result.status === 'conflict')).toHaveLength(7)

		await Promise.all(
			pages.map((page) =>
				page.waitForFunction(
					(expected) => (window as any).__tabula.views.get('editor')?.id === expected,
					winnerId,
				),
			),
		)
		const heldLocks = await pages[0].evaluate(
			async (lockName) => {
				const snapshot = await navigator.locks.query()
				return snapshot.held?.filter((lock) => lock.name === lockName).length ?? 0
			},
			`tabula-js:v1:${encodeURIComponent(ns)}:view:editor`,
		)
		expect(heldLocks).toBe(1)
	})

	test('three tabs converge on claim, fenced handle release, and vacancy', async ({ context }) => {
		const ns = uniqueNs('three-tab-view')
		const [pageA, pageB, pageC] = await Promise.all([
			context.newPage(),
			context.newPage(),
			context.newPage(),
		])
		await Promise.all([openTab(pageA, ns), openTab(pageB, ns), openTab(pageC, ns)])
		const claimed = await claimView(pageA, 'editor')
		expect(claimed.status).toBe('claimed')

		await Promise.all(
			[pageB, pageC].map((page) =>
				page.waitForFunction(() => (window as any).__tabula.views.has('editor')),
			),
		)
		const owners = await Promise.all(
			[pageA, pageB, pageC].map((page) =>
				page.evaluate(() => (window as any).__tabula.views.get('editor')?.id ?? null),
			),
		)
		expect(new Set(owners).size).toBe(1)

		await pageA.evaluate(() => (window as any).__viewHandles.editor.release())
		await Promise.all(
			[pageA, pageB, pageC].map((page) =>
				page.waitForFunction(() => !(window as any).__tabula.views.has('editor')),
			),
		)
	})

	test('a stale handle cannot release or focus a replacement claim', async ({ context }) => {
		const ns = uniqueNs('stale-handle')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		await Promise.all([openTab(pageA, ns), openTab(pageB, ns)])
		await claimView(pageA, 'editor')
		await pageA.evaluate(() => {
			;(window as any).__staleHandle = (window as any).__viewHandles.editor
			;(window as any).__staleHandle.release()
		})
		await pageB.waitForFunction(() => !(window as any).__tabula.views.has('editor'))
		const replacement = await claimView(pageB, 'editor')
		expect(replacement.status).toBe('claimed')
		await pageA.waitForFunction(() => (window as any).__tabula.views.has('editor'))

		await pageA.evaluate(() => {
			;(window as any).__staleHandle.release()
			;(window as any).__staleHandle.focus()
		})
		await pageB.waitForTimeout(250)
		expect(await hasView(pageB, 'editor')).toBe(true)
		expect(await pageB.evaluate(() => (window as any).__focusCallCount)).toBe(0)
	})

	test('refresh remembers and reclaims a held view with a newer generation', async ({ page }) => {
		const ns = uniqueNs('view-refresh')
		await openTab(page, ns)
		const first = await claimView(page, 'editor')
		expect(first.status).toBe('claimed')
		const firstGeneration = first.token?.generation ?? 0

		await page.reload()
		await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready')
		await page.waitForFunction(() => (window as any).__tabula.views.has('editor'))
		const storedGeneration = await page.evaluate((namespace) => {
			const raw = localStorage.getItem(`tabula:${namespace}:view:editor`)
			return raw ? JSON.parse(raw).token.generation : 0
		}, ns)
		expect(storedGeneration).toBeGreaterThan(firstGeneration)
	})

	test('a frozen view holder is not replaced while its lock remains held', async ({ context }) => {
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
		const conflict = await claimView(contender, 'editor')
		expect(conflict.status).toBe('conflict')
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

	test('bfcache suspension retains the exact view authority', async ({ context }) => {
		const ns = uniqueNs('view-bfcache')
		const holder = await context.newPage()
		const contender = await context.newPage()
		await Promise.all([openTab(holder, ns), openTab(contender, ns)])
		const claimed = await claimView(holder, 'editor')
		if (!claimed.token) throw new Error('Expected a fenced claim token.')
		await contender.waitForFunction(() => (window as any).__tabula.views.has('editor'))

		await holder.evaluate(() => {
			window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
		})
		await expect
			.poll(() => holder.evaluate(() => (window as any).__tabula.status().lifecycle))
			.toBe('bfcache-suspended')
		expect((await claimView(contender, 'editor')).status).toBe('conflict')

		await holder.evaluate(() => {
			window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
		})
		await expect
			.poll(() => holder.evaluate(() => (window as any).__tabula.status().lifecycle))
			.toBe('ready')
		const tokenAfter = await holder.evaluate((namespace) => {
			const raw = localStorage.getItem(`tabula:${namespace}:view:editor`)
			return raw ? JSON.parse(raw).token : null
		}, ns)
		expect(tokenAfter).toEqual(claimed.token)
	})

	test('open transfers selected structured-clone state by protocol and clears its intent', async ({
		context,
	}) => {
		const ns = uniqueNs('view-open')
		const opener = await context.newPage()
		await openTab(opener, ns)
		await opener.evaluate(() => {
			;(window as any).__tabula.state.set('document', new Map([['title', 'Typed state']]))
		})

		const popupPromise = context.waitForEvent('page')
		const opened = opener.evaluate(async (namespace) => {
			const handle = await (window as any).__tabula.open('settings', {
				url: `/claim.html?ns=${namespace}&view=settings&heartbeat=200&timeout=1000`,
				syncKeys: ['document'],
			})
			;(window as any).__openedHandle = handle
			return { name: handle.name, ownerId: handle.owner.id, token: handle.token }
		}, ns)
		const popup = await popupPromise
		await popup.waitForFunction(() => document.getElementById('status')?.textContent === 'claimed')
		const handle = await opened
		expect(handle.name).toBe('settings')
		await popup.waitForFunction(() => (window as any).__tabula.state.get('document') instanceof Map)
		expect(
			await popup.evaluate(() => (window as any).__tabula.state.get('document').get('title')),
		).toBe('Typed state')
		expect(
			await opener.evaluate(
				(namespace) => localStorage.getItem(`tabula:${namespace}:pending-open:settings`),
				ns,
			),
		).toBeNull()
	})
})
