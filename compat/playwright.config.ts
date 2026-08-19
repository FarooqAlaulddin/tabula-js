import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:5212/compat/'

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	retries: 0,
	outputDir: 'test-results',
	reporter: process.env.CI
		? [['line'], ['html', { open: 'never', outputFolder: 'report' }]]
		: 'line',
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
	],
	webServer: {
		command:
			'TABULA_COMPAT_BASE=/compat/ pnpm compat:build && TABULA_COMPAT_BASE=/compat/ pnpm exec vite preview --config vite.config.ts --host 127.0.0.1 --port 5212 --strictPort',
		url: `${baseURL}candidate.html`,
		reuseExistingServer: false,
		timeout: 120_000,
	},
})
