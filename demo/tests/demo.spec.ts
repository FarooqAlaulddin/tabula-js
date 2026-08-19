import { expect, test } from '@playwright/test'

test('all production-base routes and assets load', async ({ context }) => {
	for (const route of ['', 'editor.html', 'preview.html', 'settings.html']) {
		const page = await context.newPage()
		const response = await page.goto(route)
		expect(response?.ok()).toBe(true)
		await expect(page.locator('.companion, .dashboard')).toBeVisible()
		await expect(page.locator('#status, #runtime-status').first()).not.toContainText(
			/Connecting|failed/i,
		)
		await page.close()
	}
})

test('three tabs demonstrate exclusive editing, mirrors, UI state, conflict, and recovery', async ({
	context,
	page,
}) => {
	await page.goto('')
	await expect(page.locator('#runtime-status')).toHaveText(/ready/i)

	const secondDashboardPromise = context.waitForEvent('page')
	await page.locator('#btn-new-dashboard').click()
	const secondDashboard = await secondDashboardPromise
	await expect(secondDashboard.locator('#runtime-status')).toHaveText(/ready/i)

	await page.locator('#mode-tab').click()
	const editorPromise = context.waitForEvent('page')
	await page.locator('#btn-open-editor').click()
	const editor = await editorPromise
	await expect(editor.locator('#status')).toHaveText('Claimed "editor"')
	await expect(page.locator('#tab-list .tab-item')).toHaveCount(3)

	await editor.locator('#editor').fill('One writer, two read-only mirrors')
	await expect(page.locator('#editor-preview')).toHaveText('One writer, two read-only mirrors')
	await expect(secondDashboard.locator('#editor-preview')).toHaveText(
		'One writer, two read-only mirrors',
	)

	await page.locator('#btn-theme').click()
	await expect(editor.locator('html')).toHaveAttribute('data-theme', 'dark')
	await page.locator('#btn-logout').click()
	await expect(editor.locator('#overlay-auth')).toHaveClass(/active/)
	await editor.locator('#btn-login').click()
	await expect(page.locator('#overlay-auth')).not.toHaveClass(/active/)

	const contender = await context.newPage()
	await contender.goto('editor.html')
	await expect(contender.locator('#status')).toHaveText('Read-only: editor already open')
	await expect(contender.locator('#editor')).toHaveAttribute('readonly', '')

	await editor.close({ runBeforeUnload: false })
	await expect(page.locator('#status-editor')).toHaveText(/vacant|unclaimed/, { timeout: 10_000 })
	await contender.reload()
	await expect(contender.locator('#status')).toHaveText('Claimed "editor"')
	await expect(contender.locator('#editor')).not.toHaveAttribute('readonly', '')
})

test('a dashboard can claim and release a named view in its split pane', async ({ page }) => {
	await page.goto('')
	await expect(page.locator('#runtime-status')).toHaveText(/ready/i)
	await expect(page.locator('#mode-split')).toHaveAttribute('aria-pressed', 'true')

	await page.locator('#btn-open-editor').click()
	await expect(page.locator('#split-panel')).toBeVisible()
	await expect(page.locator('#split-title')).toHaveText('Editor')
	await expect(page.locator('#status-editor')).toHaveText('you')

	await page.locator('#split-editor').fill('An exclusive view inside the dashboard split')
	await expect(page.locator('#editor-preview')).toHaveText(
		'An exclusive view inside the dashboard split',
	)

	await page.locator('#btn-close-split').click()
	await expect(page.locator('#split-panel')).toBeHidden()
	await expect(page.locator('#status-editor')).toHaveText(/vacant|unclaimed/)
})

test('leader-owned work transfers after abrupt close', async ({ context, page }, testInfo) => {
	await page.goto('')
	const peer = await context.newPage()
	await peer.goto('')
	await expect(page.locator('#leader-status')).not.toHaveText('Electing leader...')
	await expect(peer.locator('#leader-status')).not.toHaveText('Electing leader...')

	const pageIsLeader = await page.evaluate(() => (window as any).__tabulaDemo.isLeader())
	const holder = pageIsLeader ? page : peer
	const survivor = pageIsLeader ? peer : page
	const before = Number(await survivor.locator('#leader-count').textContent())
	await holder.close({ runBeforeUnload: false })

	await expect(survivor.locator('#leader-status')).toHaveText('You hold the leader lock', {
		timeout: 10_000,
	})
	await expect
		.poll(async () => Number(await survivor.locator('#leader-count').textContent()))
		.toBeGreaterThan(before)
	await survivor.screenshot({ path: testInfo.outputPath('demo-dashboard.png'), fullPage: true })
})
