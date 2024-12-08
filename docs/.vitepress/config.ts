import { defineConfig } from 'vitepress'
import StyoCSS from '@styocss/vite-plugin-styocss'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	vite: {
		plugins: [
			StyoCSS({
				extensions: ['.vue', '.md'],
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
			{ text: 'Examples', link: '/markdown-examples' },
		],

		sidebar: [
			{
				text: 'Examples',
				items: [
					{ text: 'Markdown Examples', link: '/markdown-examples' },
					{ text: 'Runtime API Examples', link: '/api-examples' },
				],
			},
		],

		socialLinks: [
			{ icon: 'github', link: 'https://github.com/vuejs/vitepress' },
		],
	},
})
