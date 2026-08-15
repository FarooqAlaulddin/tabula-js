import path from 'node:path'
import { defineConfig } from 'vite'

const demoRoot = path.resolve(__dirname)
const packageEntry =
	process.env.TABULA_PACKAGE_ENTRY ?? path.resolve(__dirname, '../packages/tabula/dist/index.js')

export default defineConfig({
	root: demoRoot,
	base: process.env.TABULA_DEMO_BASE ?? '/',
	resolve: {
		alias: {
			'@farooqalaulddin/tabula-js': packageEntry,
		},
	},
	build: {
		outDir: path.resolve(demoRoot, 'dist'),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				dashboard: path.resolve(demoRoot, 'index.html'),
				editor: path.resolve(demoRoot, 'editor.html'),
				preview: path.resolve(demoRoot, 'preview.html'),
				settings: path.resolve(demoRoot, 'settings.html'),
			},
		},
	},
	server: {
		port: 5200,
		strictPort: true,
	},
})
