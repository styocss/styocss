import PikaCSS from '@pikacss/vite-plugin-pikacss'
import React from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		PikaCSS({
			tsCodegen: './src/pika.gen.ts',
			devCss: './src/pika.dev.css',
		}),
		React(),
	],
})
