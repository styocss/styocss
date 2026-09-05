import type { EffectiveFontsProviderOptions, FontsProviderFontEntry } from './providers'
import { describe, expect, it } from 'vitest'

import {
	builtInFontsProviders,
	defineFontsProvider,
} from './providers'

function font(
	name: string,
	weights: string[] = [],
	italic = false,
	providerOptions: EffectiveFontsProviderOptions = {},
): FontsProviderFontEntry {
	return { name, weights, italic, providerOptions }
}

describe('defineFontsProvider', () => {
	it('returns the provided definition unchanged', () => {
		const provider = defineFontsProvider({
			buildImportUrls(_fonts, _context) {
				return ['https://example.com/fonts.css']
			},
		})

		expect(provider.buildImportUrls?.([], {
			provider: 'custom',
			display: 'swap',
		}))
			.toEqual(['https://example.com/fonts.css'])
	})
})

describe('builtInFontsProviders', () => {
	it('builds Google Fonts URLs from effective per-font options', () => {
		expect(builtInFontsProviders.google.buildImportUrls?.([
			font('Open Sans', ['400', '700'], true, { text: 'AB' }),
		], {
			provider: 'google',
			display: 'swap',
		}))
			.toBe('https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;1,400;0,700;1,700&display=swap&text=AB')
	})

	it('batches equal effective options and splits request-scoped option differences', () => {
		expect(builtInFontsProviders.google.buildImportUrls?.([
			font('Inter', ['400'], false, { text: 'Shared' }),
			font('Roboto', ['700'], false, { text: 'Shared' }),
			font('Fira Sans', ['500'], false, { text: 'Different' }),
		], {
			provider: 'google',
			display: 'swap',
		}))
			.toEqual([
				'https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Roboto:wght@700&display=swap&text=Shared',
				'https://fonts.googleapis.com/css2?family=Fira+Sans:wght@500&display=swap&text=Different',
			])

		expect(builtInFontsProviders.bunny.buildImportUrls?.([
			font('Inter', ['400'], false, { text: ['A', 'B'] }),
			font('Roboto', ['700'], false, { text: ['A', 'B'] }),
		], {
			provider: 'bunny',
			display: 'fallback',
		}))
			.toBe('https://fonts.bunny.net/css?family=Inter:400|Roboto:700&display=fallback&text=A%2CB')
	})

	it('ignores unsupported options when deciding whether built-in requests can batch', () => {
		expect(builtInFontsProviders.coollabs.buildImportUrls?.([
			font('DM Sans', ['400'], false, { internal: 'one' }),
			font('Inter', ['500'], false, { internal: 'two' }),
		], {
			provider: 'coollabs',
			display: 'optional',
		}))
			.toBe('https://api.fonts.coollabs.io/css2?family=DM+Sans:wght@400&family=Inter:wght@500&display=optional')
	})

	it('builds Bunny and Google-style weightless italic families correctly', () => {
		expect(builtInFontsProviders.google.buildImportUrls?.([
			font('Inter', [], true),
		], { provider: 'google', display: 'swap' }))
			.toBe('https://fonts.googleapis.com/css2?family=Inter:ital@0;1&display=swap')

		expect(builtInFontsProviders.coollabs.buildImportUrls?.([
			font('Inter', [], true),
		], { provider: 'coollabs', display: 'swap' }))
			.toBe('https://api.fonts.coollabs.io/css2?family=Inter:ital@0;1&display=swap')

		expect(builtInFontsProviders.bunny.buildImportUrls?.([
			font('Inter', [], true),
		], { provider: 'bunny', display: 'swap' }))
			.toBe('https://fonts.bunny.net/css?family=Inter:400,400i&display=swap')

		expect(builtInFontsProviders.bunny.buildImportUrls?.([
			font('Sora'),
			font('Fira Code', ['400', '700'], true),
		], { provider: 'bunny', display: 'swap' }))
			.toBe('https://fonts.bunny.net/css?family=Sora|Fira+Code:400,400i,700,700i&display=swap')
	})

	it('requests Fontshare italic weight codes and preserves variable-range syntax on legacy imports', () => {
		expect(builtInFontsProviders.fontshare.buildImportUrls?.([
			font('Satoshi', ['400', '700'], true),
		], { provider: 'fontshare', display: 'swap' }))
			.toBe('https://api.fontshare.com/v2/css?f[]=satoshi%40400%2C401%2C700%2C701&display=swap')

		expect(builtInFontsProviders.fontshare.buildImportUrls?.([
			font('Satoshi', ['100..900'], true),
		], { provider: 'fontshare', display: 'swap' }))
			.toBe('https://api.fontshare.com/v2/css?f[]=satoshi%40100..900&display=swap')
	})

	it('builds Fontshare text URLs and keeps no-op providers empty', () => {
		expect(builtInFontsProviders.fontshare.buildImportUrls?.([
			font('Cabinet Grotesk', ['500', '700'], false, { text: 'UI' }),
		], { provider: 'fontshare', display: 'swap' }))
			.toBe('https://api.fontshare.com/v2/css?f[]=cabinet-grotesk%40500%2C700&display=swap&text=UI')

		expect(builtInFontsProviders.fontshare.buildImportUrls?.([
			font('General Sans'),
		], { provider: 'fontshare', display: 'swap' }))
			.toBe('https://api.fontshare.com/v2/css?f[]=general-sans&display=swap')

		expect(builtInFontsProviders.fontshare.buildImportUrls?.([], {
			provider: 'fontshare',
			display: 'swap',
		}))
			.toEqual([])

		expect(builtInFontsProviders.none.buildImportUrls?.([
			font('System UI'),
		], { provider: 'none', display: 'swap' }))
			.toEqual([])
	})

	it('serializes supported option arrays and ignores unsupported values', () => {
		expect(builtInFontsProviders.google.buildImportUrls?.([
			font('Inter', [], false, { text: ['A', 'B'], subset: 'latin' }),
		], { provider: 'google', display: 'swap' }))
			.toBe('https://fonts.googleapis.com/css2?family=Inter&display=swap&text=A%2CB')
	})
})
