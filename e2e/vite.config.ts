import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
	root: path.resolve(__dirname, 'fixtures'),
	resolve: {
		alias: {
			tabula: path.resolve(__dirname, '../packages/tabula/dist/index.js'),
		},
	},
	server: {
		port: 5199,
		strictPort: true,
	},
})
