import type { DefaultTheme } from 'vitepress'

export type Locale = 'root' | 'zh-tw'

type LocaleText = Record<Locale, string>

interface Leaf {
	path: string
	text: LocaleText
}

interface Group {
	text: LocaleText
	collapsed?: boolean
	items: Leaf[]
}

// Single structural source of truth. The `root` and `zh-tw` sidebars are
// derived from the same tree, so they can never drift structurally.
const groups: Group[] = [
	{
		text: { 'root': 'Getting Started', 'zh-tw': '快速開始' },
		items: [
			{ path: '/getting-started/what-is-pikacss', text: { 'root': 'What is PikaCSS', 'zh-tw': '什麼是 PikaCSS' } },
			{ path: '/getting-started/comparison', text: { 'root': 'Comparison', 'zh-tw': '比較' } },
			{ path: '/getting-started/setup', text: { 'root': 'Setup', 'zh-tw': '安裝與設定' } },
			{ path: '/getting-started/usage', text: { 'root': 'Usage', 'zh-tw': '使用方式' } },
			{ path: '/getting-started/dynamic-styles', text: { 'root': 'Dynamic Styles', 'zh-tw': '動態樣式' } },
			{ path: '/getting-started/engine-config', text: { 'root': 'Engine Config', 'zh-tw': '引擎設定' } },
			{ path: '/getting-started/eslint-config', text: { 'root': 'ESLint Config', 'zh-tw': 'ESLint 設定' } },
			{ path: '/getting-started/how-pikacss-generates-css', text: { 'root': 'How PikaCSS Generates CSS', 'zh-tw': 'PikaCSS 如何產生 CSS' } },
		],
	},
	{
		text: { 'root': 'Integrations', 'zh-tw': '整合' },
		collapsed: true,
		items: [
			{ path: '/integrations/unplugin', text: { 'root': 'Unplugin', 'zh-tw': 'Unplugin' } },
			{ path: '/integrations/nuxt', text: { 'root': 'Nuxt', 'zh-tw': 'Nuxt' } },
			{ path: '/integrations/frameworks', text: { 'root': 'Frameworks', 'zh-tw': '框架' } },
			{ path: '/integrations/ssr-and-production', text: { 'root': 'SSR & Production', 'zh-tw': 'SSR 與正式環境' } },
			{ path: '/integrations/agent-skills', text: { 'root': 'Agent Skills', 'zh-tw': 'Agent Skills' } },
		],
	},
	{
		text: { 'root': 'Customizations', 'zh-tw': '客製化' },
		collapsed: true,
		items: [
			{ path: '/customizations/layers', text: { 'root': 'Layers', 'zh-tw': 'Layers' } },
			{ path: '/customizations/important', text: { 'root': 'Important', 'zh-tw': 'Important' } },
			{ path: '/customizations/preflights', text: { 'root': 'Preflights', 'zh-tw': 'Preflights' } },
			{ path: '/customizations/variables', text: { 'root': 'Variables', 'zh-tw': '變數' } },
			{ path: '/customizations/keyframes', text: { 'root': 'Keyframes', 'zh-tw': 'Keyframes' } },
			{ path: '/customizations/selectors', text: { 'root': 'Selectors', 'zh-tw': '選擇器' } },
			{ path: '/customizations/shortcuts', text: { 'root': 'Shortcuts', 'zh-tw': 'Shortcuts' } },
			{ path: '/customizations/autocomplete', text: { 'root': 'Autocomplete', 'zh-tw': '自動完成' } },
		],
	},
	{
		text: { 'root': 'Official Plugins', 'zh-tw': '官方外掛' },
		collapsed: true,
		items: [
			{ path: '/official-plugins/reset', text: { 'root': 'Reset', 'zh-tw': 'Reset' } },
			{ path: '/official-plugins/typography', text: { 'root': 'Typography', 'zh-tw': '排版' } },
			{ path: '/official-plugins/icons', text: { 'root': 'Icons', 'zh-tw': '圖示' } },
			{ path: '/official-plugins/fonts', text: { 'root': 'Fonts', 'zh-tw': '字型' } },
			{ path: '/official-plugins/design-tokens', text: { 'root': 'Design Tokens', 'zh-tw': 'Design Tokens' } },
		],
	},
	{
		text: { 'root': 'Plugin Development', 'zh-tw': '外掛開發' },
		collapsed: true,
		items: [
			{ path: '/plugin-development/create-a-plugin', text: { 'root': 'Create a Plugin', 'zh-tw': '建立外掛' } },
			{ path: '/plugin-development/available-hooks', text: { 'root': 'Available Hooks', 'zh-tw': '可用的 Hook' } },
			{ path: '/plugin-development/type-augmentation', text: { 'root': 'Type Augmentation', 'zh-tw': '型別擴增' } },
			{ path: '/plugin-development/define-helpers', text: { 'root': 'Define Helpers', 'zh-tw': 'Define 輔助函式' } },
		],
	},
	{
		// API reference pages are generated English-only (§1.5). In the zh-tw
		// sidebar these links stay root-locale (see localizeLink).
		text: { 'root': 'API Reference', 'zh-tw': 'API 參考' },
		collapsed: true,
		items: [
			{ path: '/api/', text: { 'root': 'Overview', 'zh-tw': '總覽' } },
			{ path: '/api/core', text: { 'root': 'Core', 'zh-tw': 'Core' } },
			{ path: '/api/config', text: { 'root': 'Config', 'zh-tw': 'Config' } },
			{ path: '/api/integration', text: { 'root': 'Integration', 'zh-tw': 'Integration' } },
			{ path: '/api/unplugin', text: { 'root': 'Unplugin', 'zh-tw': 'Unplugin' } },
			{ path: '/api/nuxt', text: { 'root': 'Nuxt', 'zh-tw': 'Nuxt' } },
			{ path: '/api/plugin-reset', text: { 'root': 'Plugin Reset', 'zh-tw': 'Plugin Reset' } },
			{ path: '/api/plugin-icons', text: { 'root': 'Plugin Icons', 'zh-tw': 'Plugin Icons' } },
			{ path: '/api/plugin-fonts', text: { 'root': 'Plugin Fonts', 'zh-tw': 'Plugin Fonts' } },
			{ path: '/api/plugin-typography', text: { 'root': 'Plugin Typography', 'zh-tw': 'Plugin Typography' } },
			{ path: '/api/plugin-design-tokens', text: { 'root': 'Plugin Design Tokens', 'zh-tw': 'Plugin Design Tokens' } },
			{ path: '/api/eslint-config', text: { 'root': 'ESLint Config', 'zh-tw': 'ESLint Config' } },
		],
	},
	{
		text: { 'root': 'Troubleshooting', 'zh-tw': '疑難排解' },
		collapsed: true,
		items: [
			{ path: '/troubleshooting/faq', text: { 'root': 'FAQ', 'zh-tw': 'FAQ' } },
		],
	},
]

interface NavLeaf {
	path: string
	text: LocaleText
	target?: string
}

interface NavGroup {
	text: LocaleText
	items: NavLeaf[]
}

// Nav mirrors the top-level entry points of the sidebar tree.
const navGroups: (NavGroup | NavLeaf)[] = [
	{
		text: { 'root': 'Guide', 'zh-tw': '指南' },
		items: [
			{ path: '/getting-started/what-is-pikacss', text: { 'root': 'Getting Started', 'zh-tw': '快速開始' } },
			{ path: '/integrations/unplugin', text: { 'root': 'Integrations', 'zh-tw': '整合' } },
			{ path: '/customizations/layers', text: { 'root': 'Customizations', 'zh-tw': '客製化' } },
		],
	},
	{
		text: { 'root': 'Plugins', 'zh-tw': '外掛' },
		items: [
			{ path: '/official-plugins/reset', text: { 'root': 'Official Plugins', 'zh-tw': '官方外掛' } },
			{ path: '/plugin-development/create-a-plugin', text: { 'root': 'Plugin Development', 'zh-tw': '外掛開發' } },
		],
	},
	{ path: '/api/', text: { 'root': 'API Reference', 'zh-tw': 'API 參考' } },
	// Deployed next to the docs by deploy-docs.yml; not a VitePress page.
	{ path: 'https://pikacss.github.io/playground/', text: { 'root': 'Playground', 'zh-tw': 'Playground' }, target: '_blank' },
]

function localizeLink(path: string, locale: Locale): string {
	if (locale === 'root')
		return path
	// API reference stays root-locale (English-only, §1.5); external links untouched.
	if (path.startsWith('/api/') || /^https?:/.test(path))
		return path
	return `/zh-tw${path}`
}

function isNavGroup(item: NavGroup | NavLeaf): item is NavGroup {
	return 'items' in item
}

export function buildNav(locale: Locale): DefaultTheme.NavItem[] {
	return navGroups.map((item) => {
		if (isNavGroup(item)) {
			return {
				text: item.text[locale],
				items: item.items.map(leaf => ({
					text: leaf.text[locale],
					link: localizeLink(leaf.path, locale),
				})),
			}
		}
		return {
			text: item.text[locale],
			link: localizeLink(item.path, locale),
			...(item.target ? { target: item.target } : {}),
		}
	})
}

export function buildSidebar(locale: Locale): DefaultTheme.SidebarItem[] {
	return groups.map(group => ({
		text: group.text[locale],
		...(group.collapsed ? { collapsed: true } : {}),
		items: group.items.map(leaf => ({
			text: leaf.text[locale],
			link: localizeLink(leaf.path, locale),
		})),
	}))
}
