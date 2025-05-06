import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'
// @ts-expect-error ignore error
import { configureDiagramsPlugin } from 'vitepress-plugin-diagrams'
import { groupIconMdPlugin as MarkdownItGroupIcon } from 'vitepress-plugin-group-icons'

const base = '/pikacss/'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	base,

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
		nav: [],

		sidebar: [
			{
				text: 'Getting Started',
				items: [
					{ text: 'What is PikaCSS?', link: '/getting-started/what-is-pikacss' },
					{ text: 'Installation', link: '/getting-started/installation' },
				],
			},
			{
				text: 'Guide',
				items: [
					{ text: 'Basics', link: '/guide/basics' },
					{ text: 'Configuration', link: '/guide/configuration' },
					{ text: 'Preflights', link: '/guide/preflights' },
					{ text: 'Variables', link: '/guide/variables' },
					{ text: 'Keyframes', link: '/guide/keyframes' },
					{ text: 'Selectors', link: '/guide/selectors' },
					{ text: 'Shortcuts', link: '/guide/shortcuts' },
					{ text: 'Important', link: '/guide/important' },
					{ text: 'Plugin System', link: '/guide/plugin-system' },
				],
			},
			{
				text: 'Plugins',
				items: [
					{ text: 'Icons', link: '/plugins/icons' },
				],
			},
			{
				text: 'Examples',
				items: [
					{ text: 'Nuxt', link: 'https://stackblitz.com/fork/github/pikacss/pikacss/tree/main/examples/nuxt?file=app.vue,nuxt.config.ts,pika.config.ts' },
					{ text: 'Vue', link: 'https://stackblitz.com/fork/github/pikacss/pikacss/tree/main/examples/vite-vue3?file=src%2FApp.vue,src%2Fmain.ts,vite.config.ts,pika.config.ts' },
					{ text: 'React', link: 'https://stackblitz.com/fork/github/pikacss/pikacss/tree/main/examples/vite-react?file=src%2FApp.tsx,src%2Fmain.tsx,vite.config.ts,pika.config.ts' },
					{ text: 'SolidJS', link: 'https://stackblitz.com/fork/github/pikacss/pikacss/tree/main/examples/vite-solidjs?file=src%2FApp.tsx,src%2Fmain.tsx,vite.config.ts,pika.config.ts' },
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
			configureDiagramsPlugin(md, {
				diagramsDir: 'public/diagrams',
				publicPath: `${base}diagrams/`,
			})
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
