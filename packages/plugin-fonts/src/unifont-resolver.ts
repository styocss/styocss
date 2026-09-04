import type { DiagnosticHandler } from '@pikacss/core'
import type { FontFaceData, FontStyles, ResolveFontOptions, ResolveFontResult } from 'unifont'
import type { FontsProviderFontEntry, FontsProviderOptions } from './providers'
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
	providerOptions: FontsProviderOptions
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
	providerOptions,
	onDiagnostic,
}: ResolveFontsWithUnifontOptions<T>): Promise<UnifontProviderResolution<T>> {
	const unresolvedFonts = fonts.filter(font => requiresLegacyImport(providerName, providerOptions, font))
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
			const result = await resolver.resolveFont(font.name, {
				weights: font.weights.length > 0
					? font.weights.map(normalizeUnifontWeight)
					: defaultResolveOptions.weights,
				styles: resolveStyles(font.italic),
				subsets: defaultResolveOptions.subsets,
				formats: defaultResolveOptions.formats,
			}, serializeTextOption(mergeProviderOptions(providerOptions, font.options ?? {}).text))

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
	resolveFont: (family: string, options: CommonResolveOptions, text?: string) => Promise<ResolveFontResult>
}

type CommonResolveOptions = Pick<ResolveFontOptions, 'weights' | 'styles' | 'subsets' | 'formats'>

async function createProviderResolver(providerName: UnifontProviderName): Promise<UnifontResolver> {
	const options = { throwOnError: true }
	switch (providerName) {
		case 'google': {
			const unifont = await createUnifont([providers.google()], options)
			return {
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
				resolveFont: (family, resolveOptions) => unifont.resolveFont(family, resolveOptions),
			}
		}
		case 'fontshare': {
			const unifont = await createUnifont([providers.fontshare()], options)
			return {
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

function requiresLegacyImport(
	providerName: UnifontProviderName,
	providerOptions: FontsProviderOptions,
	font: FontsProviderFontEntry,
) {
	if (providerName === 'google')
		return false

	// unifont 0.7.4 expands Fontshare variable ranges into static weights.
	// Preserve PikaCSS's existing range request semantics until the Node >=22
	// baseline can consume a newer unifont without pulling in undici@8.
	if (providerName === 'fontshare' && font.weights.some(weight => weight.includes('..')))
		return true

	return mergeProviderOptions(providerOptions, font.options ?? {}).text != null
}

function mergeProviderOptions(globalOptions: FontsProviderOptions, fontOptions: FontsProviderOptions) {
	return {
		...globalOptions,
		...fontOptions,
	}
}

function serializeTextOption(value: FontsProviderOptions['text']) {
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
