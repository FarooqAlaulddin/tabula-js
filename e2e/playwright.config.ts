import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: './tests',
	timeout: 30000,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: 'http://localhost:5199',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'npx vite --config vite.config.ts',
		port: 5199,
		reuseExistingServer: false,
		cwd: __dirname,
	},
})
