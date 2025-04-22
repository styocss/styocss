import PikaCSS from '@pikacss/vite-plugin-pikacss'
import { defineConfig } from 'vite'
import Solid from 'vite-plugin-solid'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		PikaCSS({
			tsCodegen: './src/pika.gen.ts',
			devCss: './src/pika.dev.css',
		}),
		Solid(),
	],
})
