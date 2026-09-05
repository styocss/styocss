import type { DiagnosticHandler } from '@pikacss/core'
import type { FontFaceData, FontProperties, FontStyles, ResolveFontOptions, ResolveFontResult } from 'unifont'
import type { EffectiveFontsProviderOptions, FontsProviderFontEntry } from './providers'
import { log } from '@pikacss/core'
import { createUnifont, defaultResolveOptions, providers } from 'unifont'

export type UnifontProviderName = 'google' | 'bunny' | 'fontshare'

const unifontProviderNames = new Set<UnifontProviderName>([
	'google',
	'bunny',
	'fontshare',
])

export function isUnifontProvider(provider: string): provider is UnifontProviderName {
	return unifontProviderNames.has(provider as UnifontProviderName)
}

export interface ResolveFontsWithUnifontOptions<T extends FontsProviderFontEntry> {
	providerName: UnifontProviderName
	fonts: readonly T[]
	display: string
	onDiagnostic: DiagnosticHandler
}

export interface UnifontProviderResolution<T extends FontsProviderFontEntry> {
	css: string
	unresolvedFonts: T[]
}

export async function resolveFontsWithUnifont<T extends FontsProviderFontEntry>({
	providerName,
	fonts,
	display,
	onDiagnostic,
}: ResolveFontsWithUnifontOptions<T>): Promise<UnifontProviderResolution<T>> {
	const unresolvedFonts = fonts.filter(font => requiresLegacyImport(providerName, font.providerOptions))
	const resolvableFonts = fonts.filter(font => !unresolvedFonts.includes(font))

	if (resolvableFonts.length === 0)
		return { css: '', unresolvedFonts }

	let resolver: UnifontResolver
	try {
		resolver = await createProviderResolver(providerName)
	}
	catch (cause) {
		reportResolutionFailure({
			providerName,
			onDiagnostic,
			message: `Could not initialize fonts provider "${providerName}" through unifont. Falling back to its stylesheet import.`,
			cause,
		})
		return { css: '', unresolvedFonts: [...fonts] }
	}

	const blocks: string[] = []
	for (const font of resolvableFonts) {
		try {
			const properties = await resolver.getFontProperties(font.name)
			const result = await resolver.resolveFont(font.name, {
				weights: resolveWeights(providerName, font.weights, properties),
				styles: resolveRequestedStyles(providerName, font, properties),
				subsets: properties?.subsets ?? defaultResolveOptions.subsets,
				formats: defaultResolveOptions.formats,
			}, serializeTextOption(font.providerOptions.text))

			if (result.fonts.length === 0) {
				unresolvedFonts.push(font)
				continue
			}

			blocks.push(...result.fonts.map(face => renderUnifontFontFace(font.name, face, display)))
		}
		catch (cause) {
			unresolvedFonts.push(font)
			reportResolutionFailure({
				providerName,
				onDiagnostic,
				message: `Could not resolve font "${font.name}" from "${providerName}" through unifont. Falling back to its stylesheet import.`,
				cause,
			})
		}
	}

	return {
		css: blocks.join('\n'),
		unresolvedFonts,
	}
}

interface UnifontResolver {
	getFontProperties: (family: string) => Promise<FontProperties | undefined>
	resolveFont: (family: string, options: CommonResolveOptions, text?: string) => Promise<ResolveFontResult>
}

type CommonResolveOptions = Pick<ResolveFontOptions, 'weights' | 'styles' | 'subsets' | 'formats'>

async function createProviderResolver(providerName: UnifontProviderName): Promise<UnifontResolver> {
	const options = { apiBase: false as const, throwOnError: true }
	switch (providerName) {
		case 'google': {
			const unifont = await createUnifont([providers.google()], options)
			return {
				getFontProperties: family => unifont.getFontProperties(family),
				resolveFont: (family, resolveOptions, text) => unifont.resolveFont(family, {
					...resolveOptions,
					...(text == null
						? {}
						: {
								options: {
									google: {
										experimental: { glyphs: [text] },
									},
								},
							}),
				}),
			}
		}
		case 'bunny': {
			const unifont = await createUnifont([providers.bunny()], options)
			return {
				getFontProperties: family => unifont.getFontProperties(family),
				resolveFont: (family, resolveOptions) => unifont.resolveFont(family, resolveOptions),
			}
		}
		case 'fontshare': {
			const unifont = await createUnifont([providers.fontshare()], options)
			return {
				getFontProperties: family => unifont.getFontProperties(family),
				resolveFont: (family, resolveOptions) => unifont.resolveFont(family, resolveOptions),
			}
		}
	}
}

function resolveStyles(italic: boolean): FontStyles[] {
	return italic ? ['normal', 'italic'] : ['normal']
}

function normalizeUnifontWeight(weight: string) {
	return weight.replace('..', ' ')
}

function resolveWeights(
	providerName: UnifontProviderName,
	weights: readonly string[],
	properties: FontProperties | undefined,
) {
	if (weights.length > 0)
		return weights.map(normalizeUnifontWeight)

	// Fontshare's legacy stylesheet API treats an omitted weight axis as
	// "load every available face", including its variable range. Preserve
	// that existing PikaCSS shorthand behavior while still resolving through
	// unifont instead of collapsing a bare family request to unifont's 400
	// default.
	if (providerName === 'fontshare' && properties?.weights?.length)
		return properties.weights

	return defaultResolveOptions.weights
}

function resolveRequestedStyles(
	providerName: UnifontProviderName,
	font: FontsProviderFontEntry,
	properties: FontProperties | undefined,
) {
	// The Fontshare stylesheet endpoint also returns all available styles when
	// no weight axis is present. Matching that provider behavior keeps bare
	// entries such as `Satoshi` backwards-compatible.
	if (providerName === 'fontshare' && font.weights.length === 0 && properties?.styles?.length)
		return properties.styles

	return resolveStyles(font.italic)
}

function requiresLegacyImport(
	providerName: UnifontProviderName,
	providerOptions: EffectiveFontsProviderOptions,
) {
	if (providerName === 'google')
		return false

	return providerOptions.text != null
}

function serializeTextOption(value: EffectiveFontsProviderOptions['text'] | undefined) {
	if (value == null)
		return undefined
	return [value].flat()
		.join(',')
}

function renderUnifontFontFace(family: string, face: FontFaceData, display: string) {
	const declarations = [
		`font-family: ${cssString(family)};`,
		face.src.length > 0
			? `src: ${face.src.map(renderFontSource)
				.join(', ')};`
			: null,
		`font-display: ${display};`,
		face.weight != null ? `font-weight: ${Array.isArray(face.weight) ? face.weight.join(' ') : face.weight};` : null,
		face.style != null ? `font-style: ${face.style};` : null,
		face.stretch != null ? `font-stretch: ${face.stretch};` : null,
		face.featureSettings != null ? `font-feature-settings: ${face.featureSettings};` : null,
		face.variationSettings != null ? `font-variation-settings: ${face.variationSettings};` : null,
		face.unicodeRange?.length ? `unicode-range: ${face.unicodeRange.join(', ')};` : null,
	].filter(Boolean)

	return `@font-face { ${declarations.join(' ')} }`
}

function renderFontSource(source: FontFaceData['src'][number]) {
	if ('name' in source)
		return `local(${cssString(source.name)})`

	const parts = [`url(${cssString(toAbsoluteUrl(source.url))})`]
	if (source.format != null)
		parts.push(`format(${cssString(source.format)})`)
	if (source.tech != null)
		parts.push(`tech(${source.tech})`)
	return parts.join(' ')
}

function toAbsoluteUrl(url: string) {
	return url.startsWith('//') ? `https:${url}` : url
}

function cssString(value: string) {
	return JSON.stringify(value)
}

function reportResolutionFailure({
	providerName,
	onDiagnostic,
	message,
	cause,
}: {
	providerName: UnifontProviderName
	onDiagnostic: DiagnosticHandler
	message: string
	cause: unknown
}) {
	const causeMessage = cause instanceof Error ? ` ${cause.message}` : ''
	const fullMessage = `${message}${causeMessage}`
	onDiagnostic({
		level: 'warning',
		code: 'fonts-provider-resolution-failed',
		message: fullMessage,
		plugin: 'fonts',
	})
	log.warn(`[${providerName}] ${fullMessage}`)
}
