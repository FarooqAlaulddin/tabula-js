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
