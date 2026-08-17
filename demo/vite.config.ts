import { fileURLToPath, URL } from 'node:url'

import pikacss from '@pikacss/unplugin-pikacss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		pikacss({
			tsCodegen: './src/pika.gen.ts',
		}) as any,
		vue(),
		vueDevTools(),
	],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
})
