import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import StyoCSS from '@styocss/vite-plugin-styocss'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		StyoCSS({
			dts: './src/styo.d.ts',
		}),
		Vue(),
	],
})
