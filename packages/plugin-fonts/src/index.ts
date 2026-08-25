import type { DiagnosticHandler, EnginePlugin } from '@pikacss/core'
import type {
	FontsProvider,
	FontsProviderContext,
	FontsProviderDefinition,
	FontsProviderFontEntry,
	FontsProviderOptions,
} from './providers'
import { defineEnginePlugin, log } from '@pikacss/core'
import {
	builtInFontsProviders,
	dedupeStrings,
	defineFontsProvider,
} from './providers'

export {
	builtInFontsProviders,
	defineFontsProvider,
}

export type {
	FontsProvider,
	FontsProviderContext,
	FontsProviderDefinition,
	FontsProviderFontEntry,
	FontsProviderOptions,
}

const noopDiagnosticHandler: DiagnosticHandler = (_diagnostic) => {}

// Weights accept plain values (400), variable-font ranges (100..900), and comma-separated lists
const RE_FONT_WITH_WEIGHTS = /^(.*?):(\d+(?:\.\.\d+)?(?:,\d+(?:\.\.\d+)?)*)$/
const RE_QUOTED_FAMILY_NAME = /^['"].*['"]$/
const RE_CSS_FUNCTION_NAME = /^[a-z-]+\(/i

/**
 * Detailed metadata for a font family entry.
 *
 * @remarks Use this form instead of a plain string when you need to specify weights, italic variants, or a per-font provider override.
 *
 * @example
 * ```ts
 * const font: FontMeta = {
 *   name: 'Inter',
 *   weights: [400, 600, 700],
 *   italic: true,
 *   provider: 'bunny',
 * }
 * ```
 */
export interface FontMeta {
	/** Font family name as expected by the provider (e.g. `'Inter'`). */
	name: string
	/**
	 * Font weight values to load from the provider.
	 *
	 * @default []
	 */
	weights?: Array<string | number>
	/**
	 * Whether to include italic variants for the requested weights.
	 *
	 * @default false
	 */
	italic?: boolean
	/**
	 * Provider override for this font, taking precedence over the global `provider` option.
	 *
	 * @default undefined
	 */
	provider?: FontsProvider
	/**
	 * Provider-specific options for this font, merged with global provider options.
	 *
	 * @default undefined
	 */
	providerOptions?: FontsProviderOptions
}

/**
 * A font entry — either a shorthand string or a full metadata object.
 *
 * @remarks Strings are parsed as `'Name'` or `'Name:weight1,weight2'`. Use `FontMeta` when you need italic or provider overrides.
 *
 * @example
 * ```ts
 * const simple: FontFamilyEntry = 'Roboto'
 * const withWeights: FontFamilyEntry = 'Roboto:400,700'
 * const detailed: FontFamilyEntry = { name: 'Roboto', weights: [400, 700], italic: true }
 * ```
 */
export type FontFamilyEntry = string | FontMeta

/**
 * Describes a raw CSS `@font-face` declaration injected as a preflight.
 *
 * @remarks Each definition produces one `@font-face` block. Use this for self-hosted fonts or fonts that do not come from a provider URL.
 *
 * @example
 * ```ts
 * const face: FontFaceDefinition = {
 *   fontFamily: 'MyFont',
 *   src: 'url(/fonts/MyFont.woff2) format("woff2")',
 *   fontWeight: '400 700',
 *   fontDisplay: 'swap',
 * }
 * ```
 */
export interface FontFaceDefinition {
	/** The `font-family` name for the `@font-face` rule. */
	fontFamily: string
	/** One or more `src` descriptors (e.g. `url(...)` expressions). */
	src: string | string[]
	/**
	 * CSS `font-display` descriptor for this face.
	 *
	 * @default undefined
	 */
	fontDisplay?: string
	/**
	 * CSS `font-weight` descriptor, such as `'400'` or `'100 900'` for variable fonts.
	 *
	 * @default undefined
	 */
	fontWeight?: string | number
	/**
	 * CSS `font-style` descriptor (e.g. `'normal'`, `'italic'`).
	 *
	 * @default undefined
	 */
	fontStyle?: string
	/**
	 * CSS `font-stretch` descriptor (e.g. `'condensed'`, `'75% 125%'`).
	 *
	 * @default undefined
	 */
	fontStretch?: string
	/**
	 * CSS `unicode-range` descriptor to limit the character set.
	 *
	 * @default undefined
	 */
	unicodeRange?: string | string[]
}

/**
 * Configuration options for the fonts plugin.
 *
 * @remarks Set these under the `fonts` key in your engine config. The plugin resolves font entries, builds provider import URLs, generates `@font-face` rules, and registers `font-<token>` shortcuts.
 *
 * @example
 * ```ts
 * const options: FontsPluginOptions = {
 *   provider: 'google',
 *   display: 'swap',
 *   fonts: {
 *     sans: 'Inter:400,600,700',
 *     mono: 'Fira Code:400,700',
 *   },
 * }
 * ```
 */
export interface FontsPluginOptions {
	/**
	 * Default font provider used for all font entries that do not specify their own.
	 *
	 * @default `'google'`
	 */
	provider?: FontsProvider
	/**
	 * Font families grouped by shortcut token. Each token produces a `font-<token>` CSS shortcut.
	 *
	 * @default `{}`
	 */
	fonts?: Record<string, FontFamilyEntry | FontFamilyEntry[]>
	/**
	 * Raw `font-family` CSS stacks grouped by shortcut token; no provider loading is performed.
	 *
	 * @default `{}`
	 */
	families?: Record<string, string | string[]>
	/**
	 * Additional stylesheet URLs, each wrapped in an `@import url("...")` rule and injected before provider-generated imports.
	 *
	 * @default `[]`
	 */
	imports?: string | string[]
	/**
	 * Custom `@font-face` definitions injected as preflight CSS.
	 *
	 * @default `[]`
	 */
	faces?: FontFaceDefinition[]
	/**
	 * CSS `font-display` value applied to all provider-generated imports.
	 *
	 * @default `'swap'`
	 */
	display?: string
	/**
	 * Custom font provider implementations keyed by provider name.
	 *
	 * @default `{}`
	 */
	providers?: Record<string, FontsProviderDefinition>
	/**
	 * Provider-level options keyed by provider name, forwarded to `buildImportUrls`.
	 *
	 * @default `{}`
	 */
	providerOptions?: Record<string, FontsProviderOptions>
}

interface NormalizedFontEntry extends FontsProviderFontEntry {
	provider: FontsProvider
}

interface ResolvedFontsConfig {
	imports: string[]
	faces: FontFaceDefinition[]
	familyStacks: Record<string, string>
	providerFonts: Map<FontsProvider, NormalizedFontEntry[]>
	providers: Record<string, FontsProviderDefinition>
	providerOptions: Record<string, FontsProviderOptions>
	display: string
}

interface ParsedFontString {
	name: string
	weights: string[]
}

const genericFamilyNames = new Set([
	'serif',
	'sans-serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'ui-sans-serif',
	'ui-serif',
	'ui-monospace',
	'ui-rounded',
	'emoji',
	'math',
	'fangsong',
	'inherit',
	'initial',
	'unset',
])

const defaultFallbacks: Record<string, string[]> = {
	sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
	serif: ['ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
	mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/**
		 * Configuration for the fonts plugin.
		 *
		 * @default undefined
		 */
		fonts?: FontsPluginOptions
	}
}

/**
 * Creates the fonts engine plugin for web-font integration.
 *
 * @returns An engine plugin that registers font imports, `@font-face` preflights, CSS variables, and `font-<token>` shortcuts.
 *
 * @remarks Reads its configuration from the `fonts` key in the engine config. Supports Google Fonts, Bunny Fonts, Fontshare, Coollabs, and custom providers.
 *
 * @example
 * ```ts
 * import { fonts } from '@pikacss/plugin-fonts'
 *
 * export default defineEngineConfig({
 *   plugins: [fonts()],
 *   fonts: {
 *     provider: 'google',
 *     fonts: { sans: 'Inter:400,600,700' },
 *   },
 * })
 * ```
 */
export function fonts(): EnginePlugin {
	// The plugin object is a reusable definition (#116): the resolved config
	// is engine-local data, so it lives in `context.state` rather than this
	// factory closure, which every engine reusing this definition shares.
	return defineEnginePlugin({
		name: 'fonts',
		createState: () => ({
			fontsConfig: {} as FontsPluginOptions,
		}),
		configureRawConfig: (config, context) => {
			context.state.fontsConfig = config.fonts ?? {}
		},
		configureEngine: async (configurator) => {
			const engine = configurator.runtime
			const resolved = resolveFontsConfig(configurator.state.fontsConfig)
			const importRules = renderFontsImportRules(resolved, engine.onDiagnostic ?? noopDiagnosticHandler)
			const preflightCss = renderFontsPreflightCss(resolved)

			for (const importRule of importRules)
				engine.appendCssImport(importRule)

			if (preflightCss.length > 0) {
				engine.addPreflight({
					id: 'fonts:preflight',
					preflight: preflightCss,
				})
			}

			for (const [token, family] of Object.entries(resolved.familyStacks)) {
				const variableName = `--pk-font-${token}`
				engine.variables.add({
					[variableName]: {
						value: family,
						autocomplete: {
							asValueOf: 'font-family',
							asProperty: false,
						},
					},
				})

				engine.shortcuts.add([
					`font-${token}`,
					{ fontFamily: `var(${variableName})` },
				])
			}

			engine.appendAutocomplete({
				cssProperties: {
					'font-family': Object.values(resolved.familyStacks),
				},
			})
		},
	})
}

function resolveFontsConfig(config: FontsPluginOptions): ResolvedFontsConfig {
	const provider = config.provider ?? 'google'
	const imports = dedupeStrings([config.imports ?? []].flat())
	const faces = config.faces ?? []
	const familyStacks: Record<string, string> = {}
	const providerFonts = new Map<FontsProvider, NormalizedFontEntry[]>()

	for (const [token, definition] of Object.entries(config.fonts ?? {})) {
		const entries = [definition].flat()
		const normalizedEntries = entries.map(entry => normalizeFontEntry(entry, provider))
		const stack = dedupeStrings([
			...normalizedEntries.map(entry => normalizeFamilyName(entry.name)),
			...(defaultFallbacks[token] ?? []),
		])
		familyStacks[token] = stack.join(', ')

		normalizedEntries.forEach((entry) => {
			if (genericFamilyNames.has(entry.name.toLowerCase()))
				return
			const list = providerFonts.get(entry.provider) ?? []
			list.push(entry)
			providerFonts.set(entry.provider, list)
		})
	}

	for (const [token, definition] of Object.entries(config.families ?? {})) {
		const stack = [definition].flat()
			.map(value => normalizeFamilyName(value))
		familyStacks[token] = dedupeStrings(stack)
			.join(', ')
	}

	return {
		imports,
		faces,
		familyStacks,
		providerFonts: dedupeProviderFonts(providerFonts),
		providers: {
			...builtInFontsProviders,
			...(config.providers ?? {}),
		},
		providerOptions: config.providerOptions ?? {},
		display: config.display ?? 'swap',
	}
}

function normalizeFontEntry(entry: FontFamilyEntry, defaultProvider: FontsProvider): NormalizedFontEntry {
	if (typeof entry === 'string') {
		const parsed = parseFontString(entry)
		return {
			name: parsed.name,
			provider: genericFamilyNames.has(parsed.name.toLowerCase()) ? 'none' : defaultProvider,
			weights: parsed.weights,
			italic: false,
			options: {},
		}
	}

	return {
		name: entry.name,
		provider: entry.provider ?? (genericFamilyNames.has(entry.name.toLowerCase()) ? 'none' : defaultProvider),
		weights: (entry.weights ?? [])
			.map(weight => String(weight)),
		italic: entry.italic ?? false,
		options: entry.providerOptions ?? {},
	}
}

function parseFontString(value: string): ParsedFontString {
	const matched = value.match(RE_FONT_WITH_WEIGHTS)
	if (matched == null) {
		return { name: value, weights: [] }
	}

	const name = matched[1]!
	const weights = matched[2]!
	return {
		name,
		weights: weights.split(',')
			.filter(Boolean),
	}
}

function normalizeFamilyName(value: string) {
	if (RE_QUOTED_FAMILY_NAME.test(value))
		return value
	if (genericFamilyNames.has(value.toLowerCase()))
		return value
	if (RE_CSS_FUNCTION_NAME.test(value))
		return value
	return JSON.stringify(value)
}

function renderFontsPreflightCss(config: ResolvedFontsConfig) {
	const fontFaces = config.faces.map(renderFontFace)

	return fontFaces
		.filter(Boolean)
		.join('\n')
}

function renderFontsImportRules(config: ResolvedFontsConfig, onDiagnostic: DiagnosticHandler) {
	const providerImports = [...config.providerFonts.entries()]
		.flatMap(([providerName, fonts]) => resolveProviderImportUrls({
			providerName,
			fonts,
			providers: config.providers,
			context: {
				provider: providerName,
				display: config.display,
				options: config.providerOptions[providerName] ?? {},
			},
			onDiagnostic,
		}))

	const imports = [
		...config.imports,
		...providerImports,
	].map(url => `@import url(${JSON.stringify(url)});`)

	return dedupeStrings(imports)
}

function renderFontFace(face: FontFaceDefinition) {
	const declarations = [
		`font-family: ${normalizeFamilyName(face.fontFamily)};`,
		`src: ${[face.src].flat()
			.join(', ')};`,
		face.fontDisplay != null ? `font-display: ${face.fontDisplay};` : null,
		face.fontWeight != null ? `font-weight: ${face.fontWeight};` : null,
		face.fontStyle != null ? `font-style: ${face.fontStyle};` : null,
		face.fontStretch != null ? `font-stretch: ${face.fontStretch};` : null,
		face.unicodeRange != null
			? `unicode-range: ${[face.unicodeRange].flat()
				.join(', ')};`
			: null,
	].filter(Boolean)

	return `@font-face { ${declarations.join(' ')} }`
}

function resolveProviderImportUrls({
	providerName,
	fonts,
	providers,
	context,
	onDiagnostic,
}: {
	providerName: FontsProvider
	fonts: NormalizedFontEntry[]
	providers: Record<string, FontsProviderDefinition>
	context: FontsProviderContext
	onDiagnostic: DiagnosticHandler
}) {
	const provider = providers[providerName]
	if (provider?.buildImportUrls == null) {
		const message = `Unknown fonts provider "${providerName}". Skipping import generation.`
		onDiagnostic({ level: 'warning', code: 'fonts-unknown-provider', message, plugin: 'fonts' })
		log.warn(message)
		return []
	}

	return [provider.buildImportUrls(fonts, context) ?? []].flat()
		.filter(Boolean)
}

function dedupeProviderFonts(providerFonts: Map<FontsProvider, NormalizedFontEntry[]>) {
	const deduped = new Map<FontsProvider, NormalizedFontEntry[]>()
	for (const [provider, fonts] of providerFonts.entries()) {
		const map = new Map<string, NormalizedFontEntry>()
		for (const font of fonts) {
			const key = [
				font.provider,
				font.name,
				font.italic,
				dedupeStrings(font.weights)
					.join(','),
				serializeProviderOptions(font.options ?? {}),
			].join(':')
			if (map.has(key) === false) {
				map.set(key, {
					...font,
					weights: dedupeStrings(font.weights),
				})
			}
		}
		deduped.set(provider, [...map.values()])
	}
	return deduped
}

function serializeProviderOptions(options: FontsProviderOptions) {
	const normalized = Object.keys(options)
		.sort()
		.map(key => [key, options[key]])
	return JSON.stringify(normalized)
}
