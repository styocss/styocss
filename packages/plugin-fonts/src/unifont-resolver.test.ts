import type { FontsProviderFontEntry, FontsProviderOptions } from './providers'
import { log } from '@pikacss/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isUnifontProvider, resolveFontsWithUnifont } from './unifont-resolver'

const mocks = vi.hoisted(() => ({
	createUnifont: vi.fn(),
	google: vi.fn(() => ({ provider: 'google' })),
	bunny: vi.fn(() => ({ provider: 'bunny' })),
	fontshare: vi.fn(() => ({ provider: 'fontshare' })),
}))

vi.mock('unifont', () => ({
	createUnifont: mocks.createUnifont,
	defaultResolveOptions: {
		weights: ['400'],
		styles: ['normal', 'italic'],
		subsets: ['latin', 'cyrillic'],
		formats: ['woff2'],
	},
	providers: {
		google: mocks.google,
		bunny: mocks.bunny,
		fontshare: mocks.fontshare,
	},
}))

function font(overrides: Partial<Omit<FontsProviderFontEntry, 'options'> & { options: FontsProviderOptions }> = {}): FontsProviderFontEntry {
	return {
		name: 'Inter',
		weights: ['400'],
		italic: false,
		options: {},
		...overrides,
	}
}

beforeEach(() => {
	mocks.createUnifont.mockReset()
	mocks.google.mockClear()
	mocks.bunny.mockClear()
	mocks.fontshare.mockClear()
})

afterEach(() => {
	log.setWarnFn(console.warn.bind(console))
})

describe('unifont provider resolution', () => {
	it('recognizes only providers owned by the unifont adapter', () => {
		expect(isUnifontProvider('google'))
			.toBe(true)
		expect(isUnifontProvider('bunny'))
			.toBe(true)
		expect(isUnifontProvider('fontshare'))
			.toBe(true)
		expect(isUnifontProvider('coollabs'))
			.toBe(false)
		expect(isUnifontProvider('custom'))
			.toBe(false)
	})

	it('resolves Google fonts into complete font-face CSS and maps compatibility options', async () => {
		const getFontProperties = vi.fn(async () => ({ subsets: ['latin', 'greek'] }))
		const resolveFont = vi.fn(async () => ({
			fonts: [
				{
					src: [
						{ name: 'Inter Local' },
						{ url: '//cdn.example.test/inter.woff2', format: 'woff2', tech: 'variations' },
					],
					weight: [100, 900] as [number, number],
					style: 'italic',
					stretch: '75% 125%',
					featureSettings: '"kern" 1',
					variationSettings: '"wght" 500',
					unicodeRange: ['U+0000-00FF', 'U+0100-024F'],
				},
				{
					src: [{ url: 'https://cdn.example.test/inter-regular.woff2' }],
				},
			],
		}))
		mocks.createUnifont.mockResolvedValue({ getFontProperties, resolveFont })

		const onDiagnostic = vi.fn()
		const result = await resolveFontsWithUnifont({
			providerName: 'google',
			fonts: [font({
				name: 'Inter "UI"',
				weights: ['100..900'],
				italic: true,
				options: { text: 'LOCAL' },
			})],
			display: 'fallback',
			providerOptions: { text: 'GLOBAL' },
			onDiagnostic,
		})

		expect(mocks.google)
			.toHaveBeenCalledOnce()
		expect(mocks.createUnifont)
			.toHaveBeenCalledWith(
				[{ provider: 'google' }],
				{ apiBase: false, throwOnError: true },
			)
		expect(getFontProperties)
			.toHaveBeenCalledWith('Inter "UI"')
		expect(resolveFont)
			.toHaveBeenCalledWith('Inter "UI"', {
				weights: ['100 900'],
				styles: ['normal', 'italic'],
				subsets: ['latin', 'greek'],
				formats: ['woff2'],
				options: {
					google: {
						experimental: {
							glyphs: ['LOCAL'],
						},
					},
				},
			})
		expect(result.unresolvedFonts)
			.toEqual([])
		expect(result.css)
			.toContain('font-family: "Inter \\"UI\\"";')
		expect(result.css)
			.toContain('local("Inter Local")')
		expect(result.css)
			.toContain('url("https://cdn.example.test/inter.woff2") format("woff2") tech(variations)')
		expect(result.css)
			.toContain('font-display: fallback;')
		expect(result.css)
			.toContain('font-weight: 100 900;')
		expect(result.css)
			.toContain('font-style: italic;')
		expect(result.css)
			.toContain('font-stretch: 75% 125%;')
		expect(result.css)
			.toContain('font-feature-settings: "kern" 1;')
		expect(result.css)
			.toContain('font-variation-settings: "wght" 500;')
		expect(result.css)
			.toContain('unicode-range: U+0000-00FF, U+0100-024F;')
		expect(result.css)
			.toContain('url("https://cdn.example.test/inter-regular.woff2");')
		expect(onDiagnostic).not.toHaveBeenCalled()
	})

	it('uses unifont defaults when weights and subset metadata are absent', async () => {
		const getFontProperties = vi.fn(async () => undefined)
		const resolveFont = vi.fn(async () => ({
			fonts: [
				{ src: [{ url: 'https://fonts.example.test/inter.woff2', format: 'woff2' }], weight: 400, style: 'normal' },
				{ src: [], weight: 500, style: 'normal' },
			],
		}))
		mocks.createUnifont.mockResolvedValue({ getFontProperties, resolveFont })

		const result = await resolveFontsWithUnifont({
			providerName: 'google',
			fonts: [{ name: 'Inter', weights: [], italic: false }],
			display: 'swap',
			providerOptions: {},
			onDiagnostic: vi.fn(),
		})

		expect(resolveFont)
			.toHaveBeenCalledWith('Inter', {
				weights: ['400'],
				styles: ['normal'],
				subsets: ['latin', 'cyrillic'],
				formats: ['woff2'],
			})
		expect(result.css)
			.toContain('@font-face { font-family: "Inter"; font-display: swap; font-weight: 500; font-style: normal; }')
	})

	it('keeps Bunny text requests on the legacy stylesheet path without initializing unifont', async () => {
		const requested = font({ options: { text: ['A', 'B'] } })
		const result = await resolveFontsWithUnifont({
			providerName: 'bunny',
			fonts: [requested],
			display: 'swap',
			providerOptions: {},
			onDiagnostic: vi.fn(),
		})

		expect(result)
			.toEqual({ css: '', unresolvedFonts: [requested] })
		expect(mocks.createUnifont).not.toHaveBeenCalled()
		expect(mocks.bunny).not.toHaveBeenCalled()
	})

	it('resolves Bunny and Fontshare through their exact provider factories', async () => {
		for (const providerName of ['bunny', 'fontshare'] as const) {
			const getFontProperties = vi.fn(async () => ({ subsets: providerName === 'bunny' ? ['latin'] : undefined }))
			const resolveFont = vi.fn(async () => ({
				fonts: [{ src: [{ url: `https://${providerName}.example.test/font.woff2`, format: 'woff2' }], weight: 400, style: 'normal' }],
			}))
			mocks.createUnifont.mockResolvedValueOnce({ getFontProperties, resolveFont })

			const result = await resolveFontsWithUnifont({
				providerName,
				fonts: [font()],
				display: 'optional',
				providerOptions: {},
				onDiagnostic: vi.fn(),
			})

			expect(result.unresolvedFonts)
				.toEqual([])
			expect(result.css)
				.toContain(`https://${providerName}.example.test/font.woff2`)
		}

		expect(mocks.bunny)
			.toHaveBeenCalledOnce()
		expect(mocks.fontshare)
			.toHaveBeenCalledOnce()
	})

	it('falls back all fonts and emits a structured warning when provider initialization fails', async () => {
		const warn = vi.fn()
		log.setWarnFn((_prefix, ...args) => warn(...args))
		mocks.createUnifont.mockRejectedValue(new Error('metadata offline'))
		const onDiagnostic = vi.fn()
		const requested = [font(), font({ name: 'Roboto' })]

		const result = await resolveFontsWithUnifont({
			providerName: 'fontshare',
			fonts: requested,
			display: 'swap',
			providerOptions: {},
			onDiagnostic,
		})

		expect(result)
			.toEqual({ css: '', unresolvedFonts: requested })
		expect(onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				level: 'warning',
				code: 'fonts-provider-resolution-failed',
				plugin: 'fonts',
				message: expect.stringContaining('metadata offline'),
			}))
		expect(warn)
			.toHaveBeenCalledWith(expect.stringContaining('Falling back to its stylesheet import. metadata offline'))
	})

	it('keeps successful faces while falling back only a font whose resolution throws', async () => {
		const warn = vi.fn()
		log.setWarnFn((_prefix, ...args) => warn(...args))
		const getFontProperties = vi.fn(async () => ({ subsets: ['latin'] }))
		const resolveFont = vi.fn()
			.mockResolvedValueOnce({ fonts: [{ src: [{ url: 'https://example.test/inter.woff2' }] }] })
			.mockRejectedValueOnce('provider exploded')
		mocks.createUnifont.mockResolvedValue({ getFontProperties, resolveFont })
		const onDiagnostic = vi.fn()
		const failed = font({ name: 'Roboto' })

		const result = await resolveFontsWithUnifont({
			providerName: 'google',
			fonts: [font(), failed],
			display: 'swap',
			providerOptions: {},
			onDiagnostic,
		})

		expect(result.css)
			.toContain('inter.woff2')
		expect(result.unresolvedFonts)
			.toEqual([failed])
		expect(onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				code: 'fonts-provider-resolution-failed',
				message: expect.not.stringContaining('provider exploded'),
			}))
		expect(warn)
			.toHaveBeenCalledOnce()
	})

	it('falls back empty unifont resolutions without emitting an error diagnostic', async () => {
		mocks.createUnifont.mockResolvedValue({
			getFontProperties: vi.fn(async () => ({ subsets: ['latin'] })),
			resolveFont: vi.fn(async () => ({ fonts: [] })),
		})
		const onDiagnostic = vi.fn()
		const requested = font()

		const result = await resolveFontsWithUnifont({
			providerName: 'bunny',
			fonts: [requested],
			display: 'swap',
			providerOptions: {},
			onDiagnostic,
		})

		expect(result)
			.toEqual({ css: '', unresolvedFonts: [requested] })
		expect(onDiagnostic).not.toHaveBeenCalled()
	})
})
