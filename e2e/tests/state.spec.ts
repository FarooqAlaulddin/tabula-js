import { expect, test } from '@playwright/test'
import {
	deleteState,
	getState,
	openTab,
	setState,
	uniqueNs,
	waitForTabCount,
} from '../helpers/tabula-page'

test.describe('Shared State', () => {
	test('state set in A arrives in B', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)

		await setState(pageA, 'theme', 'dark')

		await pageB.waitForFunction(() => (window as any).__tabula.state.get('theme') === 'dark', {
			timeout: 5000,
		})
		expect(await getState(pageB, 'theme')).toBe('dark')
	})

	test('state set in B arrives in A', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageB, 2)

		await setState(pageB, 'count', 42)

		await pageA.waitForFunction(() => (window as any).__tabula.state.get('count') === 42, {
			timeout: 5000,
		})
		expect(await getState(pageA, 'count')).toBe(42)
	})

	test('state delete propagates', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)

		await setState(pageA, 'temp', 'hello')
		await pageB.waitForFunction(() => (window as any).__tabula.state.get('temp') === 'hello', {
			timeout: 5000,
		})

		await deleteState(pageA, 'temp')
		await pageB.waitForFunction(() => (window as any).__tabula.state.get('temp') === undefined, {
			timeout: 5000,
		})
		expect(await getState(pageB, 'temp')).toBeUndefined()
	})

	test('a tombstone defeats delayed set traffic and stale late-join sync', async ({ context }) => {
		const ns = uniqueNs('state-tombstone')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await pageB.evaluate((namespace) => {
			const channel = new BroadcastChannel(`tabula:${namespace}`)
			;(window as any).__stateCapture = { channel, setMessage: null }
			channel.onmessage = (event) => {
				if (event.data?.type === 'state:set' && event.data?.payload?.operation?.key === 'draft') {
					;(window as any).__stateCapture.setMessage = event.data
				}
			}
		}, ns)

		await setState(pageA, 'draft', 'old')
		await pageB.waitForFunction(() => (window as any).__tabula.state.get('draft') === 'old')
		await deleteState(pageA, 'draft')
		await pageB.waitForFunction(() => (window as any).__tabula.state.get('draft') === undefined)

		await pageB.evaluate(() => {
			const capture = (window as any).__stateCapture
			capture.channel.postMessage({
				...capture.setMessage,
				id: `${capture.setMessage.id}:delayed`,
				sentAt: Date.now(),
			})
		})
		await pageB.waitForTimeout(100)
		expect(await getState(pageA, 'draft')).toBeUndefined()
		expect(await getState(pageB, 'draft')).toBeUndefined()

		const pageC = await context.newPage()
		await openTab(pageC, ns)
		expect(await getState(pageC, 'draft')).toBeUndefined()
	})

	test('setAll callbacks observe the complete batch in lexical order', async ({ context }) => {
		const ns = uniqueNs('state-batch')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await pageB.evaluate(() => {
			const app = (window as any).__tabula
			;(window as any).__batchObservations = []
			for (const key of ['a', 'b']) {
				app.state.on(key, () => {
					;(window as any).__batchObservations.push({
						key,
						a: app.state.get('a'),
						b: app.state.get('b'),
					})
				})
			}
		})
		await pageA.evaluate(() => (window as any).__tabula.state.setAll({ b: 2, a: 1 }))
		await pageB.waitForFunction(() => (window as any).__batchObservations.length === 2)

		expect(await pageB.evaluate(() => (window as any).__batchObservations)).toEqual([
			{ key: 'a', a: 1, b: 2 },
			{ key: 'b', a: 1, b: 2 },
		])
	})

	test('cyclic cloneable values propagate and transfer-only values fail transactionally', async ({
		context,
	}) => {
		const ns = uniqueNs('state-clone')
		const pageA = await context.newPage()
		const pageB = await context.newPage()
		await openTab(pageA, ns)
		await openTab(pageB, ns)

		await pageA.evaluate(() => {
			const cyclic: any = { label: 'cycle' }
			cyclic.self = cyclic
			;(window as any).__tabula.state.set('cyclic', cyclic)
		})
		await pageB.waitForFunction(() => {
			const value = (window as any).__tabula.state.get('cyclic')
			return value?.self === value
		})

		const failure = await pageA.evaluate(() => {
			const app = (window as any).__tabula
			const { port1, port2 } = new MessageChannel()
			try {
				app.state.set('port', port1)
				return { name: null, committed: app.state.keys().includes('port') }
			} catch (error) {
				return {
					name: (error as Error).name,
					committed: app.state.keys().includes('port'),
				}
			} finally {
				port1.close()
				port2.close()
			}
		})
		expect(failure).toEqual({ name: 'DataCloneError', committed: false })
	})

	test('late-joining tab receives existing state via sync', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		await openTab(pageA, ns)

		// set state before B exists
		await setState(pageA, 'theme', 'dark')
		await setState(pageA, 'count', 99)

		// now open B — it should sync existing state
		const pageB = await context.newPage()
		await openTab(pageB, ns)
		await waitForTabCount(pageB, 2)

		await pageB.waitForFunction(() => (window as any).__tabula.state.get('theme') === 'dark', {
			timeout: 5000,
		})
		expect(await getState(pageB, 'theme')).toBe('dark')
		expect(await getState(pageB, 'count')).toBe(99)
	})

	test('a retained late response repairs state after bounded readiness', async ({ context }) => {
		const ns = uniqueNs('state-late-repair')
		const pageA = await context.newPage()
		await openTab(pageA, ns)
		await setState(pageA, 'kept', 'from-a')
		await setState(pageA, 'gone', 'old')
		await deleteState(pageA, 'gone')

		const pageB = await context.newPage()
		await pageB.addInitScript(() => {
			const NativeBroadcastChannel = window.BroadcastChannel
			;(window as any).__queuedStateSync = []
			window.BroadcastChannel = class ControlledBroadcastChannel {
				private readonly inner: BroadcastChannel
				private handler: ((event: MessageEvent) => void) | null = null

				constructor(name: string) {
					this.inner = new NativeBroadcastChannel(name)
					this.inner.onmessage = (event) => {
						if (event.data?.type === 'state:sync') {
							;(window as any).__queuedStateSync.push(() => this.handler?.(event))
							return
						}
						this.handler?.(event)
					}
				}

				set onmessage(handler: ((event: MessageEvent) => void) | null) {
					this.handler = handler
				}

				get onmessage(): ((event: MessageEvent) => void) | null {
					return this.handler
				}

				postMessage(message: unknown): void {
					this.inner.postMessage(message)
				}

				close(): void {
					this.inner.close()
				}
			} as unknown as typeof BroadcastChannel
		})
		await pageB.goto(`/?ns=${ns}&heartbeat=200&timeout=1000&readyTimeout=200`)
		await pageB.waitForFunction(() => document.getElementById('status')?.textContent === 'ready')
		expect(await pageB.evaluate(() => (window as any).__tabula.status().sync)).toBe('repairing')

		await pageB.evaluate(() => {
			const queued = (window as any).__queuedStateSync.splice(0)
			for (const deliver of queued) deliver()
		})
		await pageB.waitForFunction(
			() =>
				(window as any).__tabula.status().sync === 'complete' &&
				(window as any).__tabula.state.get('kept') === 'from-a',
		)

		expect(await getState(pageB, 'gone')).toBeUndefined()
		expect(
			await pageB.evaluate(() =>
				(window as any).__tabulaEvents.map((event: any) => `${event.type}:${event.sync ?? ''}`),
			),
		).toEqual(expect.arrayContaining(['sync:status:repairing', 'sync:status:complete']))
	})

	test('a busy responder repairs the requester after its event loop resumes', async ({
		context,
	}) => {
		const ns = uniqueNs('state-busy-repair')
		const pageA = await context.newPage()
		await openTab(pageA, ns)
		await setState(pageA, 'busy-value', 42)

		const busy = pageA.evaluate(() => {
			const until = performance.now() + 600
			while (performance.now() < until) {
				// Deliberately block this responder beyond the requester's ready budget.
			}
		})
		const pageB = await context.newPage()
		await pageB.goto(`/?ns=${ns}&heartbeat=200&timeout=1000&readyTimeout=200`)
		await pageB.waitForFunction(() => document.getElementById('status')?.textContent === 'ready')
		expect(await pageB.evaluate(() => (window as any).__tabula.status().sync)).toBe('repairing')

		await busy
		await pageB.waitForFunction(
			() =>
				(window as any).__tabula.status().sync === 'complete' &&
				(window as any).__tabula.state.get('busy-value') === 42,
			{ timeout: 5000 },
		)
	})

	test('a frozen responder repairs after browser lifecycle resume', async ({ context }) => {
		const ns = uniqueNs('state-frozen-repair')
		const pageA = await context.newPage()
		await openTab(pageA, ns)
		await setState(pageA, 'frozen-value', 'restored')
		await pageA.evaluate(() => {
			window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
		})
		await pageA.waitForFunction(
			() => (window as any).__tabula.status().lifecycle === 'bfcache-suspended',
		)

		const pageB = await context.newPage()
		await pageB.goto(`/?ns=${ns}&heartbeat=200&timeout=3000&readyTimeout=200`)
		await pageB.waitForFunction(() => document.getElementById('status')?.textContent === 'ready')
		expect(await pageB.evaluate(() => (window as any).__tabula.status().sync)).toBe('repairing')

		await pageA.evaluate(() => {
			window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
		})
		await pageB.waitForFunction(
			() =>
				(window as any).__tabula.status().sync === 'complete' &&
				(window as any).__tabula.state.get('frozen-value') === 'restored',
			{ timeout: 5000 },
		)
	})

	test('namespace isolation — state in one namespace is invisible to another', async ({
		context,
	}) => {
		const nsA = uniqueNs('iso-a')
		const nsB = uniqueNs('iso-b')

		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, nsA)
		await openTab(pageB, nsB)

		await setState(pageA, 'secret', 'only-for-a')

		// give BroadcastChannel time to deliver (if it were going to, which it should not)
		await pageB.waitForTimeout(1500)
		expect(await getState(pageB, 'secret')).toBeUndefined()
	})

	test('rapid state writes (10 increments) all propagate to other tab', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		// rapidly increment counter 10 times on A
		await pageA.evaluate(() => {
			const app = (window as any).__tabula
			for (let i = 0; i < 10; i++) {
				const cur = app.state.get('counter') ?? 0
				app.state.set('counter', cur + 1)
			}
		})

		// verify A has 10 locally
		expect(await getState(pageA, 'counter')).toBe(10)

		// wait for B to receive the final value of 10
		await pageB.waitForFunction(() => (window as any).__tabula.state.get('counter') === 10, {
			timeout: 10000,
		})
		expect(await getState(pageB, 'counter')).toBe(10)
	})

	test('state survives leader tab refresh', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		const pageB = await context.newPage()

		// open both tabs
		await openTab(pageA, ns)
		await openTab(pageB, ns)
		await waitForTabCount(pageA, 2)
		await waitForTabCount(pageB, 2)

		// set counter=42 on tab A
		await setState(pageA, 'counter', 42)

		// wait for B to see counter=42
		await pageB.waitForFunction(() => (window as any).__tabula.state.get('counter') === 42, {
			timeout: 5000,
		})
		expect(await getState(pageB, 'counter')).toBe(42)

		// refresh tab A (navigate to same URL)
		const urlA = pageA.url()
		await pageA.goto(urlA)
		await pageA.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', {
			timeout: 5000,
		})

		// after refresh, A should sync state from B and see counter=42 (NOT 0)
		await pageA.waitForFunction(() => (window as any).__tabula.state.get('counter') === 42, {
			timeout: 10000,
		})
		expect(await getState(pageA, 'counter')).toBe(42)
	})

	test('state set BEFORE second tab opens arrives via sync-request', async ({ context }) => {
		const ns = uniqueNs()
		const pageA = await context.newPage()
		await openTab(pageA, ns)

		// set state while A is alone
		await setState(pageA, 'greeting', 'hello-world')
		await setState(pageA, 'version', 7)

		// verify A has the state
		expect(await getState(pageA, 'greeting')).toBe('hello-world')
		expect(await getState(pageA, 'version')).toBe(7)

		// now open B — it should get existing state via sync-request
		const pageB = await context.newPage()
		await openTab(pageB, ns)
		await waitForTabCount(pageB, 2)

		// B should have synced both keys
		await pageB.waitForFunction(
			() => (window as any).__tabula.state.get('greeting') === 'hello-world',
			{ timeout: 5000 },
		)
		expect(await getState(pageB, 'greeting')).toBe('hello-world')
		expect(await getState(pageB, 'version')).toBe(7)
	})
})
