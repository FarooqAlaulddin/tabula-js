import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			tabula: path.resolve(__dirname, '../tabula/src/index.ts'),
			'tabula-react': path.resolve(__dirname, '../tabula-react/src/index.ts'),
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
