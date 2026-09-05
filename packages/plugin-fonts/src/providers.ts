import type { EffectiveFontsProviderOptions, FontsProviderOptionValue } from './provider-options'
import { pickSupportedProviderOptions, serializeProviderOptionsIdentity } from './provider-options'

export type { EffectiveFontsProviderOptions, FontsProviderOptions, FontsProviderOptionValue } from './provider-options'

/**
 * String literal union of the provider identifiers shipped with the plugin.
 * @internal
 *
 * @remarks `'none'` is a no-op provider used for generic CSS family names that need no external loading.
 *
 * @example
 * ```ts
 * const p: BuiltinFontsProvider = 'google'
 * ```
 */
export type BuiltinFontsProvider = 'google' | 'bunny' | 'fontshare' | 'coollabs' | 'none'

const RE_WHITESPACE = /\s+/g
const RE_NON_ALPHANUMERIC = /[^a-z0-9]+/g
const RE_TRIM_DASHES = /^-+|-+$/g

/**
 * Identifier for a font provider — either a built-in name or a custom string.
 *
 * @remarks Custom strings must have a matching entry in `FontsPluginOptions.providers` to take effect.
 *
 * @example
 * ```ts
 * const builtin: FontsProvider = 'bunny'
 * const custom: FontsProvider = 'my-cdn'
 * ```
 */
export type FontsProvider = BuiltinFontsProvider | (string & {})

/**
 * Describes a single font family to be loaded by a provider.
 *
 * @remarks Constructed internally by normalizing user-supplied font entries. `providerOptions` is the active effective map after global defaults and per-font overrides have been resolved; nullish deletion markers are removed before provider execution.
 *
 * @example
 * ```ts
 * const entry: FontsProviderFontEntry = {
 *   name: 'Roboto',
 *   weights: ['400', '700'],
 *   italic: true,
 *   providerOptions: { text: 'Hello' },
 * }
 * ```
 */
export interface FontsProviderFontEntry {
	/** Font family name as recognized by the provider (e.g. `'Roboto'`). */
	name: string
	/** Font weight values to load (e.g. `['400', '700']`). */
	weights: string[]
	/** Whether to include italic variants for the requested weights. */
	italic: boolean
	/** Active effective provider options after defaults, overrides, and nullish deletion markers are resolved. */
	providerOptions: EffectiveFontsProviderOptions
}

/**
 * Runtime context passed to a provider's `buildImportUrls` callback.
 *
 * @remarks Assembled from the resolved plugin configuration during engine setup.
 *
 * @example
 * ```ts
 * const ctx: FontsProviderContext = {
 *   provider: 'google',
 *   display: 'swap',
 * }
 * ```
 */
export interface FontsProviderContext {
	/** The provider identifier this context belongs to. */
	provider: FontsProvider
	/** CSS `font-display` value applied to all fonts from this provider. */
	display: string
}

/**
 * Blueprint for a font provider that converts normalized font requests into CSS import URLs.
 *
 * @remarks Register custom providers via `FontsPluginOptions.providers` using `defineFontsProvider`. Each font entry carries its fully resolved `providerOptions`; the context contains only provider-wide values that are identical for every entry in the callback.
 *
 * @example
 * ```ts
 * const myProvider: FontsProviderDefinition = {
 *   buildImportUrls(fonts, ctx) {
 *     return fonts.map(f => `https://my-cdn.com/css?family=${f.name}`)
 *   },
 * }
 * ```
 */
export interface FontsProviderDefinition {
	/**
	 * Generates one or more CSS import URLs for the given font entries.
	 *
	 * @default undefined
	 */
	buildImportUrls?: (
		fonts: readonly FontsProviderFontEntry[],
		context: FontsProviderContext,
	) => string | string[] | null | undefined
}

/**
 * Identity helper that defines a font provider with full type inference.
 *
 * @typeParam T - The provider definition shape, inferred from the argument.
 * @param provider - The provider definition object.
 * @returns The same provider definition, typed as `T`.
 *
 * @remarks Provides type safety without any runtime transformation.
 *
 * @example
 * ```ts
 * const myProvider = defineFontsProvider({
 *   buildImportUrls(fonts, ctx) {
 *     return fonts.map(f => `https://cdn.example.com/css?family=${f.name}`)
 *   },
 * })
 * ```
 */
export function defineFontsProvider<const T extends FontsProviderDefinition>(provider: T): T {
	return provider
}

/**
 * Registry mapping each built-in provider name to its implementation.
 *
 * @remarks Includes Google Fonts, Bunny Fonts, Fontshare, Coollabs (self-hosted Google proxy), and `none` (no-op).
 *
 * @example
 * ```ts
 * const urls = builtInFontsProviders.google.buildImportUrls?.(fonts, ctx)
 * ```
 */
export const builtInFontsProviders: Record<BuiltinFontsProvider, FontsProviderDefinition> = {
	google: defineFontsProvider({
		buildImportUrls(fonts, context) {
			return collapseProviderUrls(groupFontsBySupportedOptions(fonts, ['text'])
				.map(({ fonts: groupedFonts, options }) => `https://fonts.googleapis.com/css2?${createProviderQueryString({
					params: createGoogleStyleFamilyParams(groupedFonts),
					display: context.display,
					options,
					supportedOptionKeys: ['text'],
				})}`))
		},
	}),
	bunny: defineFontsProvider({
		buildImportUrls(fonts, context) {
			return collapseProviderUrls(groupFontsBySupportedOptions(fonts, ['text'])
				.map(({ fonts: groupedFonts, options }) => {
					const familyParam = groupedFonts.map((font) => {
						const familyName = encodeFamilyName(font.name)
						const weights = dedupeStrings(font.weights)
						if (weights.length === 0) {
							// Mirror the default (400) regular + italic pair when no weights are given.
							if (font.italic)
								return `${familyName}:400,400i`
							return familyName
						}
						if (font.italic) {
							const variants = weights.flatMap(weight => [weight, `${weight}i`])
							return `${familyName}:${variants.join(',')}`
						}
						return `${familyName}:${weights.join(',')}`
					})
						.join('|')

					return `https://fonts.bunny.net/css?${createProviderQueryString({
						params: [`family=${familyParam}`],
						display: context.display,
						options,
						supportedOptionKeys: ['text'],
					})}`
				}))
		},
	}),
	fontshare: defineFontsProvider({
		buildImportUrls(fonts, context) {
			return collapseProviderUrls(groupFontsBySupportedOptions(fonts, ['text'])
				.map(({ fonts: groupedFonts, options }) => {
					const params = groupedFonts.map((font) => {
						const familyName = toProviderSlug(font.name)
						const weights = dedupeStrings(font.weights)
						// Fontshare encodes italic as weight code + 1 (e.g. italic 400 is 401).
						const codes = font.italic
							? weights.flatMap((weight) => {
									const numeric = Number(weight)
									return Number.isNaN(numeric) ? [weight] : [weight, String(numeric + 1)]
								})
							: weights
						const axis = codes.length > 0 ? `@${codes.join(',')}` : ''
						return `f[]=${encodeURIComponent(`${familyName}${axis}`)}`
					})

					return `https://api.fontshare.com/v2/css?${createProviderQueryString({
						params,
						display: context.display,
						options,
						supportedOptionKeys: ['text'],
					})}`
				}))
		},
	}),
	coollabs: defineFontsProvider({
		buildImportUrls(fonts, context) {
			return collapseProviderUrls(groupFontsBySupportedOptions(fonts, ['text'])
				.map(({ fonts: groupedFonts, options }) => `https://api.fonts.coollabs.io/css2?${createProviderQueryString({
					params: createGoogleStyleFamilyParams(groupedFonts),
					display: context.display,
					options,
					supportedOptionKeys: ['text'],
				})}`))
		},
	}),
	none: defineFontsProvider({
		buildImportUrls() {
			return []
		},
	}),
}

interface ProviderOptionsGroup {
	fonts: FontsProviderFontEntry[]
	options: EffectiveFontsProviderOptions
}

function groupFontsBySupportedOptions(
	fonts: readonly FontsProviderFontEntry[],
	supportedOptionKeys: readonly string[],
): ProviderOptionsGroup[] {
	const groups = new Map<string, ProviderOptionsGroup>()
	for (const font of fonts) {
		const options = pickSupportedProviderOptions(font.providerOptions, supportedOptionKeys)
		const key = serializeProviderOptionsIdentity(options)
		const group = groups.get(key)
		if (group == null) {
			groups.set(key, { fonts: [font], options })
			continue
		}
		group.fonts.push(font)
	}
	return [...groups.values()]
}

function collapseProviderUrls(urls: string[]): string | string[] {
	if (urls.length === 0)
		return []
	return urls.length === 1 ? urls[0]! : urls
}

function createGoogleStyleFamilyParams(fonts: readonly FontsProviderFontEntry[]) {
	return fonts.map((font) => {
		const familyName = encodeFamilyName(font.name)
		const weights = dedupeStrings(font.weights)
		if (weights.length === 0) {
			if (font.italic)
				return `family=${familyName}:ital@0;1`
			return `family=${familyName}`
		}
		if (font.italic) {
			const pairs = weights.flatMap(weight => [`0,${weight}`, `1,${weight}`])
			return `family=${familyName}:ital,wght@${pairs.join(';')}`
		}
		return `family=${familyName}:wght@${weights.join(';')}`
	})
}

function createProviderQueryString({
	params,
	display,
	options,
	supportedOptionKeys,
}: {
	params: string[]
	display: string
	options: EffectiveFontsProviderOptions
	supportedOptionKeys: string[]
}) {
	const query = [...params, `display=${encodeURIComponent(display)}`]
	for (const key of supportedOptionKeys) {
		const value = options[key]
		if (value == null)
			continue
		query.push(`${encodeURIComponent(key)}=${encodeProviderOptionValue(value)}`)
	}
	return query.join('&')
}

function encodeProviderOptionValue(value: FontsProviderOptionValue) {
	return encodeURIComponent([value].flat()
		.join(','))
}

function encodeFamilyName(name: string) {
	return name.trim()
		.replace(RE_WHITESPACE, '+')
}

function toProviderSlug(name: string) {
	return name.trim()
		.toLowerCase()
		.replace(RE_NON_ALPHANUMERIC, '-')
		.replace(RE_TRIM_DASHES, '')
}

export function dedupeStrings(values: string[]) {
	return [...new Set(values.filter(Boolean))]
}
