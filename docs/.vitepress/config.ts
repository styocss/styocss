import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'
import { graphvizMarkdownPlugin } from 'vitepress-plugin-graphviz'
import { groupIconMdPlugin as MarkdownItGroupIcon } from 'vitepress-plugin-group-icons'
import { buildNav, buildSidebar } from './sidebarAndNav.ts'

export default defineConfig({
	base: '/',
	title: 'PikaCSS',
	description: 'The instant on-demand Atomic CSS-in-JS engine: write styles in JS objects, ship zero-runtime atomic CSS.',
	head: [
		['link', { rel: 'icon', href: '/favicon.svg' }],
	],
	locales: {
		'root': {
			label: 'English',
			lang: 'en',
		},
		'zh-tw': {
			label: '繁體中文',
			lang: 'zh-TW', // html lang attribute, BCP 47
			link: '/zh-tw/',
			description: '即時、隨需產生的 atomic CSS-in-JS 引擎：用 JS 物件撰寫樣式，輸出零執行階段成本的 atomic CSS。',
			themeConfig: {
				nav: buildNav('zh-tw'),
				sidebar: {
					'/zh-tw/': buildSidebar('zh-tw'),
				},
				outline: { label: '本頁目錄' },
				docFooter: { prev: '上一頁', next: '下一頁' },
				lastUpdated: { text: '最後更新' },
				darkModeSwitchLabel: '外觀',
				lightModeSwitchTitle: '切換至淺色模式',
				darkModeSwitchTitle: '切換至深色模式',
				sidebarMenuLabel: '選單',
				returnToTopLabel: '回到頂端',
				langMenuLabel: '切換語言',
				skipToContentLabel: '跳至內容',
				notFound: {
					title: '找不到頁面',
					quote: '你要找的頁面不存在，或已被移動。',
					linkText: '回到首頁',
					linkLabel: '回到首頁',
				},
			},
		},
	},
	themeConfig: {
		logo: {
			light: '/logo-black.svg',
			dark: '/logo-white.svg',
		},
		nav: buildNav('root'),
		sidebar: {
			'/': buildSidebar('root'),
		},
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/pikacss/pikacss' },
		],
		search: {
			provider: 'local',
			options: {
				locales: {
					'zh-tw': {
						translations: {
							button: { buttonText: '搜尋', buttonAriaLabel: '搜尋文件' },
							modal: {
								displayDetails: '顯示詳細清單',
								resetButtonTitle: '清除查詢條件',
								backButtonTitle: '關閉搜尋',
								noResultsText: '找不到相關結果',
								footer: {
									selectText: '選取',
									selectKeyAriaLabel: 'Enter 鍵',
									navigateText: '切換',
									navigateUpKeyAriaLabel: '向上鍵',
									navigateDownKeyAriaLabel: '向下鍵',
									closeText: '關閉',
									closeKeyAriaLabel: 'Esc 鍵',
								},
							},
						},
					},
				},
			},
		},
	},
	markdown: {
		config: async (md) => {
			md.use(MarkdownItGroupIcon)
			await graphvizMarkdownPlugin(md)
		},
		codeTransformers: [
			transformerTwoslash(),
		],
		languages: ['js', 'jsx', 'ts', 'tsx'],
	},
})
