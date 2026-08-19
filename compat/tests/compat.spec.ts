import { expect, test } from '@playwright/test'

function namespace(label: string): string {
	return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

test('revision 0 and candidate interoperate across every compatible protocol family', async ({
	context,
}) => {
	const ns = namespace('supported')
	const fixture = await context.newPage()
	await fixture.goto(`fixture.html?fixture=v1-rev0&ns=${ns}`)
	await expect(fixture.locator('#status')).toHaveText('ready')

	const candidate = await context.newPage()
	await candidate.goto(`candidate.html?ns=${ns}`)
	await expect(candidate.locator('#status')).toHaveText('ready')

	await expect
		.poll(() =>
			candidate.evaluate(() =>
				(globalThis as any).__candidate.workspace.tabs
					.list()
					.some((tab: any) => tab.id === 'fixture-v1-tab'),
			),
		)
		.toBe(true)
	await expect
		.poll(() =>
			fixture.evaluate(() =>
				(globalThis as any).__fixture.snapshot().observedTypes.includes('tab:announce'),
			),
		)
		.toBe(true)

	await fixture.evaluate(() => (globalThis as any).__fixture.legacySet('from-fixture', 'legacy'))
	await expect
		.poll(() =>
			candidate.evaluate(() => (globalThis as any).__candidate.workspace.state.get('from-fixture')),
		)
		.toBe('legacy')
	await fixture.evaluate(() => (globalThis as any).__fixture.legacyDelete('from-fixture'))
	await expect
		.poll(() =>
			candidate.evaluate(() => (globalThis as any).__candidate.workspace.state.get('from-fixture')),
		)
		.toBeUndefined()

	await candidate.evaluate(() => (globalThis as any).__candidate.set('from-candidate', 'modern'))
	await expect
		.poll(() =>
			fixture.evaluate(
				() => (globalThis as any).__fixture.snapshot().state['from-candidate']?.value,
			),
		)
		.toBe('modern')
	await candidate.evaluate(() => (globalThis as any).__candidate.delete('from-candidate'))
	await expect
		.poll(() =>
			fixture.evaluate(
				() => (globalThis as any).__fixture.snapshot().state['from-candidate']?.kind,
			),
		)
		.toBe('delete')

	await expect
		.poll(() =>
			fixture.evaluate(() =>
				(globalThis as any).__fixture.snapshot().observedTypes.includes('leader:change'),
			),
		)
		.toBe(true)
	await fixture.evaluate(() => (globalThis as any).__fixture.announceLeader())
	await expect
		.poll(() =>
			candidate.evaluate(() => (globalThis as any).__candidate.workspace.tabs.leader()?.id),
		)
		.toBe('fixture-v1-tab')

	await expect(
		candidate.evaluate(() => (globalThis as any).__candidate.claim('candidate-view')),
	).resolves.toBe('claimed')
	await expect
		.poll(() =>
			fixture.evaluate(() =>
				(globalThis as any).__fixture.snapshot().observedTypes.includes('view:claimed'),
			),
		)
		.toBe(true)
	await fixture.evaluate(() => (globalThis as any).__fixture.announceView('fixture-view'))
	await expect
		.poll(() =>
			candidate.evaluate(
				() => (globalThis as any).__candidate.workspace.views.get('fixture-view')?.id,
			),
		)
		.toBe('fixture-v1-tab')
})

test('an unsupported major emits one recovery signal without state or view corruption', async ({
	context,
}) => {
	const ns = namespace('unsupported')
	const candidate = await context.newPage()
	await candidate.goto(`candidate.html?ns=${ns}`)
	await expect(candidate.locator('#status')).toHaveText('ready')

	const fixture = await context.newPage()
	await fixture.goto(`fixture.html?fixture=unsupported-v2&ns=${ns}`)
	await expect(fixture.locator('#status')).toHaveText('ready')
	await fixture.evaluate(() => (globalThis as any).__fixture.blast())

	await expect
		.poll(() => candidate.evaluate(() => (globalThis as any).__candidate.incompatible.length))
		.toBe(1)
	expect(
		await candidate.evaluate(() => (globalThis as any).__candidate.incompatible[0]?.recovery),
	).toBe('Save work and reload all application tabs.')
	expect(
		await candidate.evaluate(() => (globalThis as any).__candidate.workspace.state.get('unsafe')),
	).toBeUndefined()
	expect(
		await candidate.evaluate(() =>
			(globalThis as any).__candidate.workspace.views.has('future-view'),
		),
	).toBe(false)
	await expect
		.poll(() =>
			fixture.evaluate(
				() =>
					(globalThis as any).__fixture
						.snapshot()
						.observedTypes.filter((type: string) => type === 'protocol:reject').length,
			),
		)
		.toBe(1)
})
