import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@farooqalaulddin/tabula-js': path.resolve(__dirname, '../tabula/src/index.ts'),
			'@tabula/tabula': path.resolve(__dirname, '../tabula/src/tabula.ts'),
		},
	},
	server: {
		port: 5201,
	},
	build: {
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, 'index.html'),
				canvas: path.resolve(__dirname, 'canvas.html'),
			},
		},
	},
})
