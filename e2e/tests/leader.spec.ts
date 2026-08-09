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
	test('eight contenders never overlap leader callback intervals', async ({ context }) => {
		const ns = uniqueNs('leader-contention')
		const monitor = await context.newPage()
		await monitor.goto('/')
		await monitor.evaluate((namespace) => {
			const audit = {
				active: [] as string[],
				overlaps: [] as Array<{ incoming: string; active: string[] }>,
				starts: [] as string[],
				ends: [] as string[],
			}
			;(window as any).__leaderAudit = audit
			const channel = new BroadcastChannel(`tabula-e2e-leader-audit:${namespace}`)
			channel.onmessage = (event) => {
				const message = event.data as { type: 'start' | 'end'; auditId: string }
				if (message.type === 'start') {
					if (audit.active.length > 0) {
						audit.overlaps.push({ incoming: message.auditId, active: [...audit.active] })
					}
					audit.active.push(message.auditId)
					audit.starts.push(message.auditId)
				} else {
					audit.active = audit.active.filter((id) => id !== message.auditId)
					audit.ends.push(message.auditId)
				}
			}
		}, ns)

		const contenders = await Promise.all(
			Array.from({ length: 8 }, async () => {
				const contender = await context.newPage()
				await openTab(contender, ns)
				return contender
			}),
		)
		await expect
			.poll(async () => {
				const states = await Promise.all(contenders.map((page) => isLeader(page)))
				return states.filter(Boolean).length
			})
			.toBe(1)

		const lockSnapshot = await monitor.evaluate(async (namespace) => {
			const name = `tabula-js:v1:${encodeURIComponent(namespace)}:leader`
			const snapshot = await navigator.locks.query()
			return {
				held: snapshot.held?.filter((lock) => lock.name === name).length ?? 0,
				pending: snapshot.pending?.filter((lock) => lock.name === name).length ?? 0,
			}
		}, ns)
		expect(lockSnapshot).toEqual({ held: 1, pending: 7 })

		while (contenders.length > 0) {
			const states = await Promise.all(contenders.map((page) => isLeader(page)))
			const leaderIndex = states.findIndex(Boolean)
			expect(leaderIndex).toBeGreaterThanOrEqual(0)
			const [holder] = contenders.splice(leaderIndex, 1)
			await destroyWorkspace(holder)
			await holder.close()
			if (contenders.length > 0) {
				await expect
					.poll(async () => {
						const nextStates = await Promise.all(contenders.map((page) => isLeader(page)))
						return nextStates.filter(Boolean).length
					})
					.toBe(1)
			}
		}

		await expect
			.poll(() =>
				monitor.evaluate(() => ({
					...(window as any).__leaderAudit,
					active: [...(window as any).__leaderAudit.active],
				})),
			)
			.toMatchObject({
				active: [],
				overlaps: [],
				starts: expect.any(Array),
				ends: expect.any(Array),
			})
		const audit = await monitor.evaluate(() => (window as any).__leaderAudit)
		expect(audit.starts).toHaveLength(8)
		expect(audit.ends).toHaveLength(8)
	})

	test('an abrupt holder close transfers the lock without running its cleanup', async ({
		context,
	}) => {
		const ns = uniqueNs('leader-abrupt-close')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		await Promise.all([openTab(pageA, ns), openTab(pageB, ns)])

		await expect.poll(async () => [await isLeader(pageA), await isLeader(pageB)]).toContain(true)
		const aIsLeader = await isLeader(pageA)
		const holder = aIsLeader ? pageA : pageB
		const follower = aIsLeader ? pageB : pageA
		await holder.close({ runBeforeUnload: false })

		await expect.poll(() => isLeader(follower), { timeout: 10000 }).toBe(true)
		expect(await follower.evaluate(() => (window as any).__leaderLifecycle.setupCount)).toBe(1)
	})

	test('destroying a queued contender aborts its lock request', async ({ context }) => {
		const ns = uniqueNs('leader-queued-destroy')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		await Promise.all([openTab(pageA, ns), openTab(pageB, ns)])
		await expect.poll(async () => [await isLeader(pageA), await isLeader(pageB)]).toContain(true)

		const aIsLeader = await isLeader(pageA)
		const holder = aIsLeader ? pageA : pageB
		const queued = aIsLeader ? pageB : pageA
		expect(await queued.evaluate(() => (window as any).__leaderLifecycle.setupCount)).toBe(0)
		await destroyWorkspace(queued)
		await destroyWorkspace(holder)

		await expect
			.poll(() =>
				queued.evaluate(() => ({
					...(window as any).__leaderLifecycle,
				})),
			)
			.toEqual({ setupCount: 0, cleanupCount: 0 })
	})

	test('abrupt execution-context termination releases a held workspace lock', async ({
		context,
	}) => {
		const ns = uniqueNs('leader-terminated-context')
		const holder = await context.newPage()
		await holder.goto('/')
		await holder.evaluate(async (namespace) => {
			const lockName = `tabula-js:v1:${encodeURIComponent(namespace)}:leader`
			const source = `navigator.locks.request(${JSON.stringify(
				lockName,
			)}, async () => { postMessage('held'); await new Promise(() => {}) })`
			const worker = new Worker(URL.createObjectURL(new Blob([source])))
			;(window as any).__lockWorker = worker
			await new Promise<void>((resolve) => {
				worker.onmessage = () => resolve()
			})
		}, ns)

		const follower = await context.newPage()
		await openTab(follower, ns)
		expect(await isLeader(follower)).toBe(false)
		await holder.evaluate(() => (window as any).__lockWorker.terminate())

		await expect.poll(() => isLeader(follower), { timeout: 10000 }).toBe(true)
	})

	test('a frozen holder is not replaced while its lock remains held', async ({ context }) => {
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

	test('onLeader cleanup runs when leadership is lost', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		// Identify current leader and follower
		const aIsLeader = await isLeader(pageA)
		const leader = aIsLeader ? pageA : pageB
		const follower = aIsLeader ? pageB : pageA

		await leader.waitForFunction(() => (window as any).__leaderLifecycle.setupCount === 1)
		expect(await leader.evaluate(() => ({ ...(window as any).__leaderLifecycle }))).toEqual({
			setupCount: 1,
			cleanupCount: 0,
		})

		// Destroy the leader but keep its page open so cleanup remains directly observable.
		await destroyWorkspace(leader)
		await leader.waitForFunction(() => (window as any).__leaderLifecycle.cleanupCount === 1)
		expect(await leader.evaluate(() => ({ ...(window as any).__leaderLifecycle }))).toEqual({
			setupCount: 1,
			cleanupCount: 1,
		})

		// The follower independently acquires leadership and runs its own setup.
		await follower.waitForFunction(() => (window as any).__tabula.isLeader() === true, {
			timeout: 10000,
		})
		await follower.waitForFunction(() => (window as any).__leaderLifecycle.setupCount === 1)
		expect(await follower.evaluate(() => ({ ...(window as any).__leaderLifecycle }))).toEqual({
			setupCount: 1,
			cleanupCount: 0,
		})
	})
})
