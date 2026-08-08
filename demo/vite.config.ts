import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
	root: path.resolve(__dirname),
	resolve: {
		alias: {
			'@farooqalaulddin/tabula-js': path.resolve(__dirname, '../packages/tabula/dist/index.js'),
		},
	},
	server: {
		port: 5200,
		strictPort: true,
	},
})
