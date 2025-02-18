import StyoCSS from '@styocss/vite-plugin-styocss'
import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	base: '/styocss/',

	vite: {
		plugins: [
			StyoCSS({
				fnName: '_styo',
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
				text: 'Guides',
				items: [
					{ text: 'Getting Started', link: '/guides/getting-started' },
					{ text: 'Selector', link: '/guides/selector' },
					{ text: 'Shortcut', link: '/guides/shortcut' },
					{ text: 'Preflight', link: '/guides/preflight' },
					{ text: 'Autocomplete', link: '/guides/autocomplete' },
				],
			},
			{
				text: 'Integrations',
				items: [
					{ text: 'Vite', link: '/integrations/vite' },
					{ text: 'Nuxt', link: '/integrations/nuxt' },
				],
			},
		],

		sidebar: [
			{
				text: 'Guides',
				items: [
					{ text: 'Getting Started', link: '/guides/getting-started' },
					{ text: 'Selector', link: '/guides/selector' },
					{ text: 'Shortcut', link: '/guides/shortcut' },
					{ text: 'Preflight', link: '/guides/preflight' },
					{ text: 'Autocomplete', link: '/guides/autocomplete' },
				],
			},
			{
				text: 'Integrations',
				items: [
					{ text: 'Vite', link: '/integrations/vite' },
					{ text: 'Nuxt', link: '/integrations/nuxt' },
				],
			},
		],

		socialLinks: [
			{ icon: 'github', link: 'https://github.com/styocss/styocss' },
		],
	},
})
