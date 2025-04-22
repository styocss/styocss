import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'
import { groupIconMdPlugin as MarkdownItGroupIcon } from 'vitepress-plugin-group-icons'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	base: '/pikacss/',

	title: 'PikaCSS',
	description: 'PikaCSS Documents',
	head: [
		['link', { rel: 'icon', href: '/pikacss/favicon.svg' }],
	],
	themeConfig: {
		logo: {
			light: '/logo-black.svg',
			dark: '/logo-white.svg',
		},

		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: 'Home', link: '/' },
			{
				text: 'Guides',
				items: [
					{ text: 'Getting Started', link: '/guides/getting-started' },
					{ text: 'Why PikaCSS?', link: '/guides/why' },
					{ text: 'Selector', link: '/guides/selector' },
					{ text: 'Shortcut', link: '/guides/shortcut' },
					{ text: 'Keyframes', link: '/guides/keyframes' },
					{ text: 'Variables', link: '/guides/variables' },
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
					{ text: 'Why PikaCSS?', link: '/guides/why' },
					{ text: 'Selector', link: '/guides/selector' },
					{ text: 'Shortcut', link: '/guides/shortcut' },
					{ text: 'Keyframes', link: '/guides/keyframes' },
					{ text: 'Variables', link: '/guides/variables' },
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
			{ icon: 'github', link: 'https://github.com/pikacss/pikacss' },
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
				// 		'pika.d.ts': '/// <reference types="./.vitepress/pika.d.ts" />\n',
				// 	},
				// },
			}),
		],
		languages: ['js', 'jsx', 'ts', 'tsx'],
	},
})
