import { expect, test } from '@playwright/test'

for (const capability of ['broadcast-channel', 'web-locks'] as const) {
	test(`creation reports CapabilityError when ${capability} is unavailable`, async ({ page }) => {
		await page.goto(`/capability.html?missing=${capability}`)
		await expect(page.locator('#status')).toHaveText('failed-as-expected')
		await expect
			.poll(() => page.evaluate(() => (window as any).__capabilityError))
			.toMatchObject({ name: 'CapabilityError' })
	})
}
