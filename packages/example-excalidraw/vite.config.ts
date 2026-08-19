import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	root: __dirname,
	plugins: [react()],
	base: process.env.TABULA_EXCALIDRAW_BASE ?? '/',
	resolve: {
		alias: {
			'@thinkly/tabula-js':
				process.env.TABULA_PACKAGE_ENTRY ?? path.resolve(__dirname, '../tabula/src/index.ts'),
			'@tabula/tabula': path.resolve(__dirname, '../tabula/src/tabula.ts'),
		},
	},
	server: {
		port: 5201,
	},
	build: {
		outDir: process.env.TABULA_EXCALIDRAW_OUT_DIR
			? path.resolve(process.env.TABULA_EXCALIDRAW_OUT_DIR)
			: path.resolve(__dirname, 'dist'),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, 'index.html'),
				canvas: path.resolve(__dirname, 'canvas.html'),
			},
		},
	},
})
