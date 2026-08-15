import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: {
			'@tabula': path.resolve(__dirname, 'packages/tabula/src'),
		},
	},
	test: {
		globals: true,
		environment: 'node',
		exclude: ['e2e/**', 'demo/**', '**/node_modules/**'],
	},
})
