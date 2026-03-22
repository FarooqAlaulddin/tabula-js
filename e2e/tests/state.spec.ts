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

		// now open B — it should sync
		const pageB = await context.newPage()
		await openTab(pageB, ns)
		await waitForTabCount(pageB, 2)

		// give sync time to complete
		await pageB.waitForFunction(() => (window as any).__tabula.state.get('theme') === 'dark', {
			timeout: 5000,
		})
		expect(await getState(pageB, 'theme')).toBe('dark')
		expect(await getState(pageB, 'count')).toBe(99)
	})

	test('namespace isolation', async ({ context }) => {
		const nsA = uniqueNs('iso-a')
		const nsB = uniqueNs('iso-b')

		const pageA = await context.newPage()
		const pageB = await context.newPage()

		await openTab(pageA, nsA)
		await openTab(pageB, nsB)

		await setState(pageA, 'secret', 'only-for-a')

		// wait a bit, then verify B does NOT have it
		await pageB.waitForTimeout(1000)
		expect(await getState(pageB, 'secret')).toBeUndefined()
	})
})
