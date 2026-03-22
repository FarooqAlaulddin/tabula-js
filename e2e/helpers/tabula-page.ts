import type { Page } from '@playwright/test'

let nsCounter = 0

export function uniqueNs(prefix = 'e2e'): string {
	return `${prefix}-${Date.now()}-${++nsCounter}`
}

export async function openTab(page: Page, ns: string, path = '/'): Promise<void> {
	await page.goto(`${path}?ns=${ns}&heartbeat=200&timeout=1000`)
	await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', {
		timeout: 5000,
	})
}

export async function getState(page: Page, key: string): Promise<unknown> {
	return page.evaluate((k) => (window as any).__tabula.state.get(k), key)
}

export async function setState(page: Page, key: string, value: unknown): Promise<void> {
	await page.evaluate(({ k, v }) => (window as any).__tabula.state.set(k, v), { k: key, v: value })
}

export async function deleteState(page: Page, key: string): Promise<void> {
	await page.evaluate((k) => (window as any).__tabula.state.delete(k), key)
}

export async function getTabCount(page: Page): Promise<number> {
	return page.evaluate(() => (window as any).__tabula.tabs.list().length)
}

export async function waitForTabCount(page: Page, count: number, timeoutMs = 5000): Promise<void> {
	await page.waitForFunction(
		(expected) => (window as any).__tabula.tabs.list().length === expected,
		count,
		{ timeout: timeoutMs },
	)
}

export async function isLeader(page: Page): Promise<boolean> {
	return page.evaluate(() => (window as any).__tabula.isLeader())
}

export async function claimView(page: Page, viewName: string): Promise<void> {
	await page.evaluate((name) => (window as any).__tabula.claim(name), viewName)
}

export async function hasView(page: Page, viewName: string): Promise<boolean> {
	return page.evaluate((name) => (window as any).__tabula.views.has(name), viewName)
}

export async function getViews(page: Page): Promise<Record<string, unknown>> {
	return page.evaluate(() => (window as any).__tabula.views.list())
}

export async function destroyWorkspace(page: Page): Promise<void> {
	await page.evaluate(() => (window as any).__tabula.destroy())
}

export async function getEvents(
	page: Page,
): Promise<Array<{ type: string; [key: string]: unknown }>> {
	return page.evaluate(() => (window as any).__tabulaEvents)
}

export async function waitForEvent(page: Page, eventType: string, timeoutMs = 5000): Promise<void> {
	await page.waitForFunction(
		(type) => (window as any).__tabulaEvents.some((e: any) => e.type === type),
		eventType,
		{ timeout: timeoutMs },
	)
}

export async function getTabId(page: Page): Promise<string> {
	return page.evaluate(() => (window as any).__tabula.tabs.current().id)
}

export async function getLeaderTabId(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		const leader = (window as any).__tabula.tabs.leader()
		return leader ? leader.id : null
	})
}
