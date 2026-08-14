import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: './tests',
	timeout: 30000,
	retries: process.env.CI ? 2 : 0,
	outputDir: 'test-results',
	reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
	use: {
		baseURL: 'http://localhost:5199',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
		{
			name: 'firefox',
			// CDP lifecycle controls have no portable Playwright equivalent.
			testIgnore: /chromium-lifecycle\.spec\.ts/,
			use: { ...devices['Desktop Firefox'] },
		},
		{
			name: 'webkit',
			// Linux WebKit coverage is not represented as Safari evidence.
			testIgnore: /chromium-lifecycle\.spec\.ts/,
			use: { ...devices['Desktop Safari'] },
		},
	],
	webServer: {
		command: 'npx vite --config vite.config.ts',
		port: 5199,
		reuseExistingServer: false,
		cwd: __dirname,
	},
})
