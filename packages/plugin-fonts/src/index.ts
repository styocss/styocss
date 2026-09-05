import type { DiagnosticHandler, EnginePlugin } from '@pikacss/core'
import type {
	EffectiveFontsProviderOptions,
	FontsProvider,
	FontsProviderContext,
	FontsProviderDefinition,
	FontsProviderFontEntry,
	FontsProviderOptions,
	FontsProviderOptionValue,
} from './providers'
import { defineEnginePlugin, log } from '@pikacss/core'
import { resolveProviderOptions, serializeProviderOptionsIdentity } from './provider-options'
import {
	builtInFontsProviders,
	dedupeStrings,
	defineFontsProvider,
} from './providers'
import { isUnifontProvider, resolveFontsWithUnifont } from './unifont-resolver'

export {
	builtInFontsProviders,
	defineFontsProvider,
}

export type {
	EffectiveFontsProviderOptions,
	FontsProvider,
	FontsProviderContext,
	FontsProviderDefinition,
	FontsProviderFontEntry,
	FontsProviderOptions,
	FontsProviderOptionValue,
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
	 * Provider-specific overrides for this font. These are shallow-merged over the matching global `providerOptions` defaults. Explicit `null` or `undefined` values delete an inherited option; deletion markers are removed before provider execution.
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
 * @remarks Set these under the `fonts` key in your engine config. Google, Bunny, and Fontshare entries are resolved through unifont into `@font-face` rules at build time; legacy/custom providers remain stylesheet imports. The plugin also registers `font-<token>` shortcuts.
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
	 * Additional stylesheet URLs, each wrapped in an `@import url("...")` rule and injected before legacy/custom provider imports.
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
	 * CSS `font-display` value applied to provider-resolved `@font-face` rules and legacy provider imports.
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
	 * Provider-level defaults keyed by provider name. Each font entry receives one active effective option map formed by applying its `FontMeta.providerOptions` overrides to these defaults and removing nullish deletion markers before any provider path runs.
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
	customProviderNames: Set<string>
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
 * @remarks Reads its configuration from the `fonts` key in the engine config. Google Fonts, Bunny Fonts, and Fontshare resolve through unifont at build time with a legacy stylesheet fallback; Coollabs and custom providers keep the stylesheet-provider path.
 *
 * @example
 * ```ts
 * import { fonts } from '@pikacss/plugin-fonts'
 * import { defineConfig } from '@pikacss/unplugin-pikacss'
 *
 * export default defineConfig({
 *   engine: {
 *     plugins: [fonts()],
 *     fonts: {
 *       provider: 'google',
 *       fonts: { sans: 'Inter:400,600,700' },
 *     },
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
			resolved: undefined as ResolvedFontsConfig | undefined,
		}),
		configureRawConfig: (config, context) => {
			const resolved = resolveFontsConfig(config.fonts ?? {})
			context.state.resolved = resolved

			const variables = Object.fromEntries(
				Object.entries(resolved.familyStacks)
					.map(([token, family]) => {
						const name = `--pk-font-${token}`
						return [name, {
							value: family,
							suggest: { asValueOf: 'font-family' as const, asProperty: false },
						}]
					}),
			)
			const existingVariables = config.variables?.definitions == null
				? []
				: [config.variables.definitions].flat()
			config.variables = {
				...config.variables,
				definitions: [...existingVariables, variables],
			}

			const generatedShortcuts = Object.keys(resolved.familyStacks)
				.map(token => ({
					name: `font-${token}`,
					value: { fontFamily: `var(--pk-font-${token})` },
				}))
			config.shortcuts = {
				definitions: [...(config.shortcuts?.definitions ?? []), ...generatedShortcuts],
			}
		},
		configureEngine: async (configurator) => {
			const engine = configurator.runtime
			const resolved = configurator.state.resolved ?? resolveFontsConfig({})
			const providerOutput = await resolveFontsProviderOutput(resolved, engine.onDiagnostic ?? noopDiagnosticHandler)
			const preflightCss = [providerOutput.preflightCss, renderFontsPreflightCss(resolved)]
				.filter(Boolean)
				.join('\n')

			for (const importRule of providerOutput.importRules)
				engine.appendCssImport(importRule)

			if (preflightCss.length > 0) {
				engine.addPreflight({
					id: 'fonts:preflight',
					preflight: preflightCss,
				})
			}
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
		const normalizedEntries = entries.map(entry => normalizeFontEntry(entry, provider, config.providerOptions ?? {}))
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
		customProviderNames: new Set(Object.keys(config.providers ?? {})),
		display: config.display ?? 'swap',
	}
}

function normalizeFontEntry(
	entry: FontFamilyEntry,
	defaultProvider: FontsProvider,
	providerOptions: Record<string, FontsProviderOptions>,
): NormalizedFontEntry {
	if (typeof entry === 'string') {
		const parsed = parseFontString(entry)
		const provider = genericFamilyNames.has(parsed.name.toLowerCase()) ? 'none' : defaultProvider
		return {
			name: parsed.name,
			provider,
			weights: parsed.weights,
			italic: false,
			providerOptions: resolveProviderOptions(providerOptions[provider] ?? {}, {}),
		}
	}

	const provider = entry.provider ?? (genericFamilyNames.has(entry.name.toLowerCase()) ? 'none' : defaultProvider)
	return {
		name: entry.name,
		provider,
		weights: (entry.weights ?? [])
			.map(weight => String(weight)),
		italic: entry.italic ?? false,
		providerOptions: resolveProviderOptions(providerOptions[provider] ?? {}, entry.providerOptions ?? {}),
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

async function resolveFontsProviderOutput(config: ResolvedFontsConfig, onDiagnostic: DiagnosticHandler) {
	const providerImports: string[] = []
	const providerPreflights: string[] = []

	for (const [providerName, fonts] of config.providerFonts.entries()) {
		let importFonts = fonts
		if (isUnifontProvider(providerName) && config.customProviderNames.has(providerName) === false) {
			const resolution = await resolveFontsWithUnifont({
				providerName,
				fonts,
				display: config.display,
				onDiagnostic,
			})
			if (resolution.css.length > 0)
				providerPreflights.push(resolution.css)
			importFonts = resolution.unresolvedFonts
		}

		if (importFonts.length === 0)
			continue

		providerImports.push(...resolveProviderImportUrls({
			providerName,
			fonts: importFonts.map(toProviderFontEntry),
			providers: config.providers,
			context: {
				provider: providerName,
				display: config.display,
			},
			onDiagnostic,
		}))
	}

	const importRules = [
		...config.imports,
		...providerImports,
	].map(url => `@import url(${JSON.stringify(url)});`)

	return {
		importRules: dedupeStrings(importRules),
		preflightCss: providerPreflights.join('\n'),
	}
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

function toProviderFontEntry(font: NormalizedFontEntry): FontsProviderFontEntry {
	return {
		name: font.name,
		weights: font.weights,
		italic: font.italic,
		providerOptions: font.providerOptions,
	}
}

function resolveProviderImportUrls({
	providerName,
	fonts,
	providers,
	context,
	onDiagnostic,
}: {
	providerName: FontsProvider
	fonts: FontsProviderFontEntry[]
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
				serializeProviderOptionsIdentity(font.providerOptions),
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
