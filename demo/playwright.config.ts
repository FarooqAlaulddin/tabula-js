import { defineConfig, devices } from '@playwright/test'

const deployedBaseUrl = process.env.DEMO_BASE_URL
const localBaseUrl = 'http://127.0.0.1:5211/tabula-js/'

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	retries: 0,
	outputDir: 'test-results',
	reporter: process.env.CI ? [['line'], ['html', { open: 'never', outputFolder: 'report' }]] : 'line',
	use: {
		baseURL: deployedBaseUrl ?? localBaseUrl,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
	],
	webServer: deployedBaseUrl
		? undefined
		: {
				command:
					'TABULA_DEMO_BASE=/tabula-js/ pnpm demo:build && TABULA_DEMO_BASE=/tabula-js/ pnpm exec vite preview --config vite.config.ts --host 127.0.0.1 --port 5211 --strictPort',
				url: localBaseUrl,
				reuseExistingServer: false,
				timeout: 120_000,
			},
})
