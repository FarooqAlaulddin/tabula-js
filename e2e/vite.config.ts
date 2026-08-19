import path from 'node:path'
import { defineConfig } from 'vite'

const packageEntry =
	process.env.TABULA_PACKAGE_ENTRY ?? path.resolve(__dirname, '../packages/tabula/dist/index.js')

export default defineConfig({
	root: path.resolve(__dirname, 'fixtures'),
	resolve: {
		alias: {
			'@thinkly/tabula-js': packageEntry,
		},
	},
	server: {
		port: 5199,
		strictPort: true,
	},
})
