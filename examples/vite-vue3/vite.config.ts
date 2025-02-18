import StyoCSS from '@styocss/vite-plugin-styocss'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		StyoCSS({
			dts: './src/styo.d.ts',
			devCss: './src/styo.dev.css',
		}),
		Vue(),
	],
})
