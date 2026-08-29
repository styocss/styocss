import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const RE_SURROUNDING_QUOTES = /^['"]|['"]$/g
const RE_PACKAGE_DIR_NAME = /^[A-Za-z\d][\w-]*$/u

// ---------------------------------------------------------------------------
// Package definitions (shared across maintain-docs and maintain-jsdocs)
// ---------------------------------------------------------------------------

export interface PackageDef {
	name: string
	dir: string
	slug: string
	order: number
	description: string
	pageTitle: string
	guideLink?: { text: string, url: string }
	reExports?: string
}

export const PACKAGES: PackageDef[] = [
	{
		name: '@pikacss/core',
		dir: 'core',
		slug: 'core',
		order: 20,
		description: 'Core engine, define helpers for config and plugin authoring, and built-in plugin system',
		pageTitle: 'Core API reference',
		guideLink: { text: 'Usage guide', url: '/getting-started/usage' },
	},
	{
		name: '@pikacss/config',
		dir: 'config',
		slug: 'config',
		order: 25,
		description: 'Canonical project configuration and defineConfig authoring surface',
		pageTitle: 'Config API reference',
		guideLink: { text: 'Engine configuration', url: '/getting-started/engine-config' },
		reExports: '@pikacss/core',
	},
	{
		name: '@pikacss/integration',
		dir: 'integration',
		slug: 'integration',
		order: 30,
		description: 'Build-tool integration context',
		pageTitle: 'Integration API reference',
		guideLink: { text: 'Unplugin integration', url: '/integrations/unplugin' },
		reExports: '@pikacss/core',
	},
	{
		name: '@pikacss/unplugin-pikacss',
		dir: 'unplugin',
		slug: 'unplugin',
		order: 40,
		description: 'Bundler adapters for the Rollup and Webpack families',
		pageTitle: 'Unplugin API reference',
		guideLink: { text: 'Unplugin integration', url: '/integrations/unplugin' },
		reExports: '@pikacss/integration',
	},
	{
		name: '@pikacss/nuxt-pikacss',
		dir: 'nuxt',
		slug: 'nuxt',
		order: 50,
		description: 'Nuxt module for PikaCSS',
		pageTitle: 'Nuxt API reference',
		guideLink: { text: 'Nuxt integration', url: '/integrations/nuxt' },
		reExports: '@pikacss/unplugin-pikacss',
	},
	{
		name: '@pikacss/plugin-reset',
		dir: 'plugin-reset',
		slug: 'plugin-reset',
		order: 60,
		description: 'CSS reset preflight plugin',
		pageTitle: 'Plugin Reset API reference',
		guideLink: { text: 'Reset plugin', url: '/official-plugins/reset' },
	},
	{
		name: '@pikacss/plugin-icons',
		dir: 'plugin-icons',
		slug: 'plugin-icons',
		order: 70,
		description: 'Icon shortcuts via Iconify',
		pageTitle: 'Plugin Icons API reference',
		guideLink: { text: 'Icons plugin', url: '/official-plugins/icons' },
	},
	{
		name: '@pikacss/plugin-fonts',
		dir: 'plugin-fonts',
		slug: 'plugin-fonts',
		order: 80,
		description: 'Web font integration',
		pageTitle: 'Plugin Fonts API reference',
		guideLink: { text: 'Fonts plugin', url: '/official-plugins/fonts' },
	},
	{
		name: '@pikacss/plugin-typography',
		dir: 'plugin-typography',
		slug: 'plugin-typography',
		order: 90,
		description: 'Prose typography shortcuts',
		pageTitle: 'Plugin Typography API reference',
		guideLink: { text: 'Typography plugin', url: '/official-plugins/typography' },
	},
	{
		name: '@pikacss/plugin-design-tokens',
		dir: 'plugin-design-tokens',
		slug: 'plugin-design-tokens',
		order: 95,
		description: 'W3C design tokens to CSS variables',
		pageTitle: 'Plugin Design Tokens API reference',
		guideLink: { text: 'Design Tokens plugin', url: '/official-plugins/design-tokens' },
	},
	{
		name: '@pikacss/eslint-config',
		dir: 'eslint-config',
		slug: 'eslint-config',
		order: 100,
		description: 'ESLint flat config for PikaCSS',
		pageTitle: 'ESLint Config API reference',
		guideLink: { text: 'ESLint setup', url: '/getting-started/eslint-config' },
	},
]

// ---------------------------------------------------------------------------
// CLI utilities
// ---------------------------------------------------------------------------

export function readMultiValueOption(args: string[], optionName: string) {
	const values: string[] = []
	for (let idx = args.indexOf(optionName); idx !== -1; idx = args.indexOf(optionName, idx + 1)) {
		for (let i = idx + 1; i < args.length; i++) {
			const v = args[i]
			if (!v || v.startsWith('--'))
				break
			values.push(v)
		}
	}
	return values
}

export function normalizePackageScope(input: string) {
	const normalized = input.trim()
		.replace(RE_SURROUNDING_QUOTES, '')
	if (!normalized)
		throw new Error('Package scope cannot be empty.')
	if (normalized.startsWith('@pikacss/'))
		return normalized.slice('@pikacss/'.length)
	if (normalized.startsWith('packages/')) {
		const parts = normalized.split('/')
		if (parts[1])
			return parts[1]
	}
	if (RE_PACKAGE_DIR_NAME.test(normalized))
		return normalized
	throw new Error(`Unsupported package scope: ${input}`)
}
