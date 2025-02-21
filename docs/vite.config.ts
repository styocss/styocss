import StyoCSS from '@styocss/vite-plugin-styocss'
import { defineConfig } from 'vite'
import { groupIconVitePlugin as VitepressGroupIcon } from 'vitepress-plugin-group-icons'

export default defineConfig({
	plugins: [
		StyoCSS({
			fnName: '_styo',
			target: ['**/*.vue', '**/*.md'],
			config: 'styo.config.ts',
			dts: '.vitepress/styo.d.ts',
			devCss: '.vitepress/styo.dev.css',
		}),
		VitepressGroupIcon(),
	],
})
