import path from 'node:path'
import { defineConfig } from 'vite'

const compatRoot = path.resolve(__dirname)
const packageEntry =
	process.env.TABULA_PACKAGE_ENTRY ?? path.resolve(__dirname, '../packages/tabula/dist/index.js')

export default defineConfig({
	root: compatRoot,
	base: process.env.TABULA_COMPAT_BASE ?? '/',
	publicDir: false,
	resolve: {
		alias: {
			'@farooqalaulddin/tabula-js': packageEntry,
		},
	},
	build: {
		outDir: path.resolve(compatRoot, 'dist'),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				candidate: path.resolve(compatRoot, 'candidate.html'),
				fixture: path.resolve(compatRoot, 'fixture.html'),
			},
		},
	},
})
