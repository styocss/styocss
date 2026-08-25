import type { EnginePlugin } from '@pikacss/core'
import { createEngine as createCoreEngine, log } from '@pikacss/core'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fonts } from './index'

function createEngine() {
	const imports: string[] = []
	const preflights: unknown[] = []
	const variableDefinitions: Array<Record<string, unknown>> = []
	const shortcutDefinitions: Array<[string, unknown]> = []

	return {
		imports,
		preflights,
		variableDefinitions,
		shortcutDefinitions,
		appendCssImport(rule: string) {
			imports.push(rule)
		},
		addPreflight(preflight: unknown) {
			preflights.push(preflight)
		},
		variables: {
			add(definition: Record<string, unknown>) {
				variableDefinitions.push(definition)
			},
		},
		shortcuts: {
			add(definition: [string, unknown]) {
				shortcutDefinitions.push(definition)
			},
		},
	}
}

// Mirrors the per-engine context the core dispatcher creates for a plugin
// definition (#116): one context object per simulated engine, each with its
// own `createState()` result.
function createContext(plugin: EnginePlugin) {
	return {
		onDiagnostic: vi.fn(),
		state: plugin.createState!(),
		pika: { extendStatic: vi.fn() },
		typegen: { add: vi.fn() },
		host: {},
	}
}

afterEach(() => {
	log.setWarnFn(console.warn.bind(console))
})

describe('fonts plugin', () => {
	it('registers imports, preflights, variables, shortcuts, and autocomplete from the resolved config', async () => {
		const plugin = fonts()
		const engine = createEngine()
		const context = createContext(plugin)

		plugin.configureRawConfig?.({
			fonts: {
				imports: ['https://cdn.example.com/base.css', 'https://cdn.example.com/base.css'],
				fonts: {
					sans: ['Inter:400,700', { name: 'Roboto Flex', weights: [400], italic: true }],
					mono: 'monospace',
				},
				families: {
					brand: ['Avenir Next', 'sans-serif'],
				},
				faces: [
					{
						fontFamily: 'Acme Sans',
						src: 'url("/fonts/acme.woff2") format("woff2")',
						fontWeight: 400,
						unicodeRange: ['U+000-5FF'],
					},
				],
				display: 'fallback',
				providerOptions: {
					google: {
						text: 'UI',
					},
				},
			},
		} as any, context)

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		expect(engine.imports)
			.toEqual(expect.arrayContaining([
				'@import url("https://cdn.example.com/base.css");',
			]))
		expect(engine.imports.some(rule => rule.includes('fonts.googleapis.com/css2?')))
			.toBe(true)
		expect(engine.imports.some(rule => rule.includes('display=fallback')))
			.toBe(true)
		expect(engine.preflights)
			.toEqual([
				expect.objectContaining({
					id: 'fonts:preflight',
					preflight: expect.stringContaining('@font-face'),
				}),
			])
		expect(context.state.resolved.familyStacks.sans)
			.toContain('Inter')
		expect(context.state.resolved.familyStacks.brand)
			.toBe('"Avenir Next", sans-serif')
		expect(engine.variableDefinitions)
			.toEqual([])
		expect(engine.shortcutDefinitions)
			.toEqual([])
	})

	it('lowers variables/shortcuts into effective Core config without owning duplicate Typegen', async () => {
		const engine = await createCoreEngine({
			plugins: [fonts()],
			fonts: { families: { brand: ['Avenir Next', 'sans-serif'] } },
			variables: { definitions: { '--caller': { value: 'blue' } } },
			shortcuts: { definitions: [{ name: 'caller-shortcut', value: { color: 'red' } }] },
		})

		const variableDefinitions = [engine.config.rawConfig.variables?.definitions ?? []].flat()
		expect(variableDefinitions[0])
			.toEqual({ '--caller': { value: 'blue' } })
		expect((variableDefinitions.at(-1) as Record<string, unknown>)['--pk-font-brand'])
			.toEqual(expect.objectContaining({
				value: '"Avenir Next", sans-serif',
				suggest: { asValueOf: 'font-family', asProperty: false },
			}))

		const shortcutDefinitions = engine.config.rawConfig.shortcuts?.definitions ?? []
		expect(shortcutDefinitions[0])
			.toEqual({ name: 'caller-shortcut', value: { color: 'red' } })
		expect(shortcutDefinitions)
			.toContainEqual({ name: 'font-brand', value: { fontFamily: 'var(--pk-font-brand)' } })

		const contributions = engine.typegen.snapshot.contributions
		expect(contributions.some(({ id }) => id === 'fonts'))
			.toBe(false)
		expect(contributions.find(({ id }) => id === 'core:variables')?.declarations)
			.toContain('var(--pk-font-brand)')
		expect(contributions.find(({ id }) => id === 'core:shortcuts')?.declarations)
			.toContain('"font-brand"')

		const ids = await engine.use('font-brand')
		expect(await engine.renderAtomicStyles(false, { atomicStyleIds: ids }))
			.toContain('font-family:var(--pk-font-brand)')
	})

	it('dedupes provider fonts, skips generic-family imports, and preserves family normalization for custom providers', async () => {
		const plugin = fonts()
		const engine = createEngine()
		const context = createContext(plugin)
		const customProvider = vi.fn(() => ['https://fonts.example.com/custom.css', ''])

		plugin.configureRawConfig?.({
			fonts: {
				fonts: {
					body: [
						'Inter:400,400',
						{ name: 'Inter', weights: ['400'], providerOptions: { subset: 'latin' } },
						{ name: 'serif' },
						'serif',
					],
					display: [
						{ name: 'Cabinet Grotesk', provider: 'custom', weights: [500], italic: true, providerOptions: { family: 'display' } },
						{ name: 'Cabinet Grotesk', provider: 'custom', weights: ['500'], italic: true, providerOptions: { family: 'display' } },
					],
					mono: 'system-ui',
				},
				families: {
					brand: ['var(--font-brand)', '"Already Quoted"', 'system-ui'],
				},
				providers: {
					custom: {
						buildImportUrls: customProvider,
					},
				},
				providerOptions: {
					custom: { text: 'Display' },
				},
			},
		} as any, context)

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		expect(customProvider)
			.toHaveBeenCalledWith(
				[
					{
						name: 'Cabinet Grotesk',
						provider: 'custom',
						weights: ['500'],
						italic: true,
						options: { family: 'display' },
					},
				],
				expect.objectContaining({
					provider: 'custom',
					options: { text: 'Display' },
				}),
			)
		expect(engine.imports.filter(rule => rule.includes('Cabinet')))
			.toEqual([])
		expect(engine.imports)
			.toEqual(expect.arrayContaining([
				'@import url("https://fonts.example.com/custom.css");',
			]))
		expect(engine.imports.filter(rule => rule.includes('fonts.googleapis.com/css2?')))
			.toHaveLength(1)
		expect(engine.preflights)
			.toEqual([])
		expect(context.state.resolved.familyStacks.body)
			.toContain('serif')
		expect(context.state.resolved.familyStacks.brand)
			.toBe('var(--font-brand), "Already Quoted", system-ui')
		expect(context.state.resolved.familyStacks.mono)
			.toBe('system-ui, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace')
	})

	it('renders complete font-face declarations and avoids provider imports for generic-only tokens', async () => {
		const plugin = fonts()
		const engine = createEngine()
		const context = createContext(plugin)

		plugin.configureRawConfig?.({
			fonts: {
				fonts: {
					ui: ['system-ui', 'sans-serif'],
				},
				faces: [
					{
						fontFamily: 'Source Serif 4',
						src: [
							'url("/fonts/source-serif.woff2") format("woff2")',
							'url("/fonts/source-serif.woff") format("woff")',
						],
						fontDisplay: 'optional',
						fontWeight: '600',
						fontStyle: 'italic',
						fontStretch: 'condensed',
						unicodeRange: 'U+000-5FF',
					},
					{
						fontFamily: 'Source Serif 4 Fallback',
						src: 'url("/fonts/source-serif-fallback.woff2") format("woff2")',
						fontDisplay: 'swap',
					},
				],
			},
		} as any, context)

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		expect(engine.imports)
			.toEqual([])
		expect(engine.preflights)
			.toHaveLength(1)
		expect(engine.preflights[0])
			.toEqual(expect.objectContaining({
				id: 'fonts:preflight',
				preflight: expect.any(String),
			}))

		const preflightCss = (engine.preflights[0] as { preflight: string }).preflight
		expect(preflightCss.match(/@font-face/g))
			.toHaveLength(2)
		expect(preflightCss)
			.toContain('font-family: "Source Serif 4";')
		expect(preflightCss)
			.toContain('url("/fonts/source-serif.woff2") format("woff2"), url("/fonts/source-serif.woff") format("woff")')
		expect(preflightCss)
			.toContain('font-display: optional;')
		expect(preflightCss)
			.toContain('font-weight: 600;')
		expect(preflightCss)
			.toContain('font-style: italic;')
		expect(preflightCss)
			.toContain('font-stretch: condensed;')
		expect(preflightCss)
			.toContain('unicode-range: U+000-5FF;')
		expect(preflightCss)
			.toContain('font-family: "Source Serif 4 Fallback";')
		expect(preflightCss)
			.toContain('url("/fonts/source-serif-fallback.woff2") format("woff2")')
		expect(context.state.resolved.familyStacks.ui)
			.toContain('system-ui')
	})

	it('parses variable-font weight ranges in string entries', async () => {
		const plugin = fonts()
		const engine = createEngine()
		const context = createContext(plugin)
		const customProvider = vi.fn(() => [])

		plugin.configureRawConfig?.({
			fonts: {
				provider: 'custom',
				fonts: {
					sans: 'Inter:100..900',
					serif: 'Roboto Serif:400,500..700',
				},
				providers: {
					custom: {
						buildImportUrls: customProvider,
					},
				},
			},
		} as any, context)

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		expect(customProvider)
			.toHaveBeenCalledWith(
				[
					expect.objectContaining({
						name: 'Inter',
						weights: ['100..900'],
					}),
					expect.objectContaining({
						name: 'Roboto Serif',
						weights: ['400', '500..700'],
					}),
				],
				expect.anything(),
			)
	})

	it('keeps setup side effects minimal when the fonts config is omitted', async () => {
		const plugin = fonts()
		const engine = createEngine()
		const context = createContext(plugin)

		plugin.configureRawConfig?.({} as any, context)

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		expect(engine.imports)
			.toEqual([])
		expect(engine.preflights)
			.toEqual([])
		expect(engine.variableDefinitions)
			.toEqual([])
		expect(engine.shortcutDefinitions)
			.toEqual([])
	})

	it('keeps token registration while skipping import rules when a provider returns null', async () => {
		const plugin = fonts()
		const engine = createEngine()
		const context = createContext(plugin)
		const silentProvider = vi.fn(() => null)

		plugin.configureRawConfig?.({
			fonts: {
				fonts: {
					accent: {
						name: 'Acme Sans',
						provider: 'silent',
					},
				},
				providers: {
					silent: {
						buildImportUrls: silentProvider,
					},
				},
			},
		} as any, context)

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		expect(silentProvider)
			.toHaveBeenCalledWith(
				[
					{
						name: 'Acme Sans',
						provider: 'silent',
						weights: [],
						italic: false,
						options: {},
					},
				],
				expect.objectContaining({
					provider: 'silent',
					options: {},
				}),
			)
		expect(engine.imports)
			.toEqual([])
		expect(context.state.resolved.familyStacks.accent)
			.toContain('Acme Sans')
	})

	it('warns and skips provider imports when a runtime provider definition is missing', async () => {
		const plugin = fonts()
		const engine = createEngine()
		const context = createContext(plugin)
		const warn = vi.fn()

		log.setWarnFn((_prefix, ...args) => warn(...args))

		plugin.configureRawConfig?.({
			fonts: {
				provider: 'custom-missing',
				fonts: {
					body: 'Inter',
				},
			},
		} as any, context)

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		expect(warn)
			.toHaveBeenCalledWith('Unknown fonts provider "custom-missing". Skipping import generation.')
		expect(engine.imports)
			.toEqual([])
	})

	describe('per-engine plugin state (#116)', () => {
		it('reuses one plugin instance across two engines without leaking state', async () => {
			const plugin = fonts()

			// Engine A: explicit non-default fonts config.
			const contextA = createContext(plugin)
			const engineA = createEngine()
			plugin.configureRawConfig?.({
				fonts: {
					fonts: {
						sans: 'Inter:400,700',
					},
				},
			} as any, contextA)
			await plugin.configureEngine?.({ ...contextA, runtime: engineA } as any)

			expect(contextA.state.resolved.familyStacks.sans)
				.toContain('Inter')

			// Engine B: reuses the same plugin definition with the option
			// omitted — it must observe the documented default, not A's value.
			const contextB = createContext(plugin)
			const engineB = createEngine()
			plugin.configureRawConfig?.({} as any, contextB)
			await plugin.configureEngine?.({ ...contextB, runtime: engineB } as any)

			expect(engineB.shortcutDefinitions)
				.toEqual([])
			expect(contextB.state.resolved.familyStacks)
				.toEqual({})
			expect(contextA.state.resolved.familyStacks.sans)
				.toContain('Inter')
		})

		it('keeps concurrently interleaved engines isolated', async () => {
			const plugin = fonts()
			const contextA = createContext(plugin)
			const contextB = createContext(plugin)

			// Interleave deterministically: A configures, then B configures
			// with the option omitted, then B finishes, then A finishes. A's
			// configureEngine must still observe A's own value.
			plugin.configureRawConfig?.({
				fonts: {
					fonts: {
						sans: 'Inter:400,700',
					},
				},
			} as any, contextA)
			plugin.configureRawConfig?.({} as any, contextB)

			const engineB = createEngine()
			await plugin.configureEngine?.({ ...contextB, runtime: engineB } as any)

			const engineA = createEngine()
			await plugin.configureEngine?.({ ...contextA, runtime: engineA } as any)

			expect(engineB.shortcutDefinitions)
				.toEqual([])
			expect(contextB.state.resolved.familyStacks)
				.toEqual({})
			expect(contextA.state.resolved.familyStacks.sans)
				.toContain('Inter')
		})
	})
})
