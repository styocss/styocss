import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'
import { groupIconMdPlugin as MarkdownItGroupIcon } from 'vitepress-plugin-group-icons'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	base: '/styocss/',

	title: 'StyoCSS',
	description: 'StyoCSS Documents',
	head: [
		['link', { rel: 'icon', href: '/styocss/logo-white.svg' }],
	],
	themeConfig: {
		siteTitle: false,
		logo: {
			light: '/logo.svg',
			dark: '/logo-white.svg',
		},

		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: 'Home', link: '/' },
			{
				text: 'Guides',
				items: [
					{ text: 'Getting Started', link: '/guides/getting-started' },
					{ text: 'Why StyoCSS?', link: '/guides/why' },
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
			{
				text: 'Playground',
				items: [
					{ text: 'Vue', link: '/playground/vue' },
				],
			},
		],

		sidebar: [
			{
				text: 'Guides',
				items: [
					{ text: 'Getting Started', link: '/guides/getting-started' },
					{ text: 'Why StyoCSS?', link: '/guides/why' },
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

	markdown: {
		config: (md) => {
			md.use(MarkdownItGroupIcon)
		},
		codeTransformers: [
			// @ts-expect-error according to the official docs, this is the correct way to use the transformer
			transformerTwoslash({
				// twoslashOptions: {
				// 	extraFiles: {
				// 		'styo.d.ts': '/// <reference types="./.vitepress/styo.d.ts" />\n',
				// 	},
				// },
			}),
		],
		languages: ['js', 'jsx', 'ts', 'tsx'],
	},
})
