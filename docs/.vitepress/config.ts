import { defineConfig } from 'vitepress'
import StyoCSS from '@styocss/vite-plugin-styocss'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	vite: {
		plugins: [
			StyoCSS({
				target: ['**/*.vue', '**/*.md'],
				config: '.vitepress/styo.config.ts',
				dts: '.vitepress/styo.d.ts',
			}),
		],
	},

	title: 'StyoCSS',
	description: 'StyoCSS Documents',
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: 'Home', link: '/' },
			{
				text: 'Guide',
				items: [
					{ text: 'Getting Started', link: '/guide/getting-started' },
				],
			},
		],

		sidebar: [
			{
				text: 'Guide',
				items: [
					{ text: 'Getting Started', link: '/guide/getting-started' },
				],
			},
		],

		socialLinks: [
			{ icon: 'github', link: 'https://github.com/styocss/styocss' },
		],
	},
})
