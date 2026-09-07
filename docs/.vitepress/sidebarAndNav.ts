import type { DefaultTheme } from 'vitepress'

export type Locale = 'root' | 'zh-tw'

type LocaleText = Record<Locale, string>

interface Leaf {
	path: string
	order: number
	text: LocaleText
}

interface Group {
	category: string
	text: LocaleText
	collapsed?: boolean
	items: Leaf[]
}

// Page identity source of truth for docs navigation. Markdown frontmatter mirrors
// category/order and is checked against this registry by maintain-docs:check.
const groups: Group[] = [
	{
		category: 'getting-started',
		text: { 'root': 'Getting Started', 'zh-tw': '快速開始' },
		items: [
			{ path: '/getting-started/what-is-pikacss', order: 10, text: { 'root': 'What is PikaCSS', 'zh-tw': '什麼是 PikaCSS' } },
			{ path: '/getting-started/comparison', order: 15, text: { 'root': 'Comparison', 'zh-tw': '比較' } },
			{ path: '/getting-started/setup', order: 20, text: { 'root': 'Setup', 'zh-tw': '安裝與設定' } },
			{ path: '/getting-started/usage', order: 30, text: { 'root': 'Usage', 'zh-tw': '使用方式' } },
			{ path: '/getting-started/dynamic-styles', order: 35, text: { 'root': 'Dynamic Styles', 'zh-tw': '動態樣式' } },
			{ path: '/getting-started/engine-config', order: 40, text: { 'root': 'Engine Config', 'zh-tw': '引擎設定' } },
			{ path: '/getting-started/eslint-config', order: 50, text: { 'root': 'ESLint Config', 'zh-tw': 'ESLint 設定' } },
			{ path: '/getting-started/how-pikacss-generates-css', order: 60, text: { 'root': 'How PikaCSS Generates CSS', 'zh-tw': 'PikaCSS 如何產生 CSS' } },
		],
	},
	{
		category: 'integrations',
		text: { 'root': 'Integrations', 'zh-tw': '整合' },
		collapsed: true,
		items: [
			{ path: '/integrations/unplugin', order: 10, text: { 'root': 'Unplugin', 'zh-tw': 'Unplugin' } },
			{ path: '/integrations/nuxt', order: 20, text: { 'root': 'Nuxt', 'zh-tw': 'Nuxt' } },
			{ path: '/integrations/frameworks', order: 22, text: { 'root': 'Frameworks', 'zh-tw': '框架' } },
			{ path: '/integrations/ssr-and-production', order: 24, text: { 'root': 'SSR & Production', 'zh-tw': 'SSR 與正式環境' } },
			{ path: '/integrations/agent-skills', order: 30, text: { 'root': 'Agent Skills', 'zh-tw': 'Agent Skills' } },
		],
	},
	{
		category: 'customizations',
		text: { 'root': 'Customizations', 'zh-tw': '客製化' },
		collapsed: true,
		items: [
			{ path: '/customizations/layers', order: 10, text: { 'root': 'Layers', 'zh-tw': 'Layers' } },
			{ path: '/customizations/important', order: 20, text: { 'root': 'Important', 'zh-tw': 'Important' } },
			{ path: '/customizations/preflights', order: 30, text: { 'root': 'Preflights', 'zh-tw': 'Preflights' } },
			{ path: '/customizations/variables', order: 40, text: { 'root': 'Variables', 'zh-tw': '變數' } },
			{ path: '/customizations/keyframes', order: 50, text: { 'root': 'Keyframes', 'zh-tw': 'Keyframes' } },
			{ path: '/customizations/selectors', order: 60, text: { 'root': 'Selectors', 'zh-tw': '選擇器' } },
			{ path: '/customizations/shortcuts', order: 70, text: { 'root': 'Shortcuts', 'zh-tw': 'Shortcuts' } },
			{ path: '/customizations/autocomplete', order: 80, text: { 'root': 'Autocomplete', 'zh-tw': '自動完成' } },
		],
	},
	{
		category: 'official-plugins',
		text: { 'root': 'Official Plugins', 'zh-tw': '官方外掛' },
		collapsed: true,
		items: [
			{ path: '/official-plugins/reset', order: 10, text: { 'root': 'Reset', 'zh-tw': 'Reset' } },
			{ path: '/official-plugins/typography', order: 20, text: { 'root': 'Typography', 'zh-tw': '排版' } },
			{ path: '/official-plugins/icons', order: 30, text: { 'root': 'Icons', 'zh-tw': '圖示' } },
			{ path: '/official-plugins/fonts', order: 40, text: { 'root': 'Fonts', 'zh-tw': '字型' } },
			{ path: '/official-plugins/design-tokens', order: 50, text: { 'root': 'Design Tokens', 'zh-tw': 'Design Tokens' } },
		],
	},
	{
		category: 'plugin-development',
		text: { 'root': 'Plugin Development', 'zh-tw': '外掛開發' },
		collapsed: true,
		items: [
			{ path: '/plugin-development/create-a-plugin', order: 10, text: { 'root': 'Create a Plugin', 'zh-tw': '建立外掛' } },
			{ path: '/plugin-development/available-hooks', order: 20, text: { 'root': 'Available Hooks', 'zh-tw': '可用的 Hook' } },
			{ path: '/plugin-development/type-augmentation', order: 30, text: { 'root': 'Type Augmentation', 'zh-tw': '型別擴增' } },
			{ path: '/plugin-development/define-helpers', order: 40, text: { 'root': 'Define Helpers', 'zh-tw': 'Define 輔助函式' } },
		],
	},
	{
		// API reference pages are generated English-only (§1.5). In the zh-tw
		// sidebar these links stay root-locale (see localizeLink).
		category: 'api',
		text: { 'root': 'API Reference', 'zh-tw': 'API 參考' },
		collapsed: true,
		items: [
			{ path: '/api/', order: 0, text: { 'root': 'Overview', 'zh-tw': '總覽' } },
			{ path: '/api/core', order: 20, text: { 'root': 'Core', 'zh-tw': 'Core' } },
			{ path: '/api/config', order: 25, text: { 'root': 'Config', 'zh-tw': 'Config' } },
			{ path: '/api/integration', order: 30, text: { 'root': 'Integration', 'zh-tw': 'Integration' } },
			{ path: '/api/unplugin', order: 40, text: { 'root': 'Unplugin', 'zh-tw': 'Unplugin' } },
			{ path: '/api/nuxt', order: 50, text: { 'root': 'Nuxt', 'zh-tw': 'Nuxt' } },
			{ path: '/api/plugin-reset', order: 60, text: { 'root': 'Plugin Reset', 'zh-tw': 'Plugin Reset' } },
			{ path: '/api/plugin-icons', order: 70, text: { 'root': 'Plugin Icons', 'zh-tw': 'Plugin Icons' } },
			{ path: '/api/plugin-fonts', order: 80, text: { 'root': 'Plugin Fonts', 'zh-tw': 'Plugin Fonts' } },
			{ path: '/api/plugin-typography', order: 90, text: { 'root': 'Plugin Typography', 'zh-tw': 'Plugin Typography' } },
			{ path: '/api/plugin-design-tokens', order: 95, text: { 'root': 'Plugin Design Tokens', 'zh-tw': 'Plugin Design Tokens' } },
			{ path: '/api/eslint-config', order: 100, text: { 'root': 'ESLint Config', 'zh-tw': 'ESLint Config' } },
		],
	},
	{
		category: 'troubleshooting',
		text: { 'root': 'Troubleshooting', 'zh-tw': '疑難排解' },
		collapsed: true,
		items: [
			{ path: '/troubleshooting/faq', order: 10, text: { 'root': 'FAQ', 'zh-tw': 'FAQ' } },
		],
	},
]

export interface DocsPageIdentity {
	path: string
	category: string
	order: number
	text: LocaleText
}

export const pageRegistry: readonly DocsPageIdentity[] = groups.flatMap(group => group.items.map(leaf => ({
	path: leaf.path,
	category: group.category,
	order: leaf.order,
	text: leaf.text,
})))

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
		items: group.items.toSorted((left, right) => left.order - right.order)
			.map(leaf => ({
				text: leaf.text[locale],
				link: localizeLink(leaf.path, locale),
			})),
	}))
}
