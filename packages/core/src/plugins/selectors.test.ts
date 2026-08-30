import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'
import { defineEnginePlugin } from '../plugin'
import { renderTypegenDocument } from '../typegen/render'
import { resolveSelectorConfig } from './selectors'

describe('selectors plugin', () => {
	it('resolves static and dynamic object definitions without learning from runtime hits', async () => {
		const engine = await createEngine({
			selectors: {
				definitions: [
					{ name: 'hover', value: '$:hover', description: 'Hover state' },
					{
						pattern: /^child-(\d+)$/,
						inputType: '`child-$' + '{number}`',
						resolve: matched => `$:nth-child(${matched[1]})`,
						autocomplete: ['child-2'],
					},
				],
			},
		})

		expect(await engine.pluginHooks.transformSelectors(engine.config.plugins, ['hover', 'child-3', 'raw']))
			.toEqual(['$:hover', '$:nth-child(3)', 'raw'])
		const before = engine.typegen.snapshot
		await engine.pluginHooks.transformSelectors(engine.config.plugins, ['child-99'])
		expect(engine.typegen.snapshot)
			.toEqual(before)
	})

	it('accepts only the frozen object grammar at normalization time', () => {
		expect(resolveSelectorConfig({ name: 'focus', value: '$:focus' }))
			.toMatchObject({ type: 'static' })
		expect(resolveSelectorConfig({
			pattern: /^nth-(\d+)$/,
			inputType: '`nth-$' + '{number}`',
			resolve: matched => `$:nth-child(${matched[1]})`,
		}))
			.toMatchObject({ type: 'dynamic' })
		expect(resolveSelectorConfig(['hover', '$:hover'] as any))
			.toBeUndefined()
		expect(resolveSelectorConfig('hover' as any))
			.toBeUndefined()
	})
})

it('finalizes deterministic selector Typegen members and excludes invalid autocomplete inputs', async () => {
	const diagnostics: unknown[] = []
	const engine = await createEngine({
		selectors: {
			definitions: [
				{ name: 'hover', value: '$:hover', description: 'Hover docs' },
				{ name: '@sm', value: '@media (min-width: 640px)' },
				{
					pattern: /^nth-(\d+)$/g,
					inputType: '`nth-$' + '{number}`',
					resolve: matched => `$:nth-child(${matched[1]})`,
					autocomplete: ['nth-2', 'invalid'],
					description: 'Nth docs',
				},
			],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

	const contribution = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:selectors')
	expect(contribution?.selectors)
		.toBe('__PikaSelectors')
	expect(contribution?.declarations)
		.toContain('"hover"?: __StyleDefinition')
	expect(contribution?.declarations)
		.toContain('"nth-2"?: __StyleDefinition')
	expect(contribution?.declarations)
		.not.toContain('"invalid"?: __StyleDefinition')
	expect(contribution?.declarations)
		.toContain('type __PikaDynamicSelectorInput = `nth-$' + '{number}`')
	expect(contribution?.declarations)
		.toContain('type __PikaDynamicSelectors = { [K in __PikaDynamicSelectorInput]?: __StyleDefinition | __StyleItem[] }')
	expect(contribution?.declarations)
		.toContain('Hover docs')
	expect(contribution?.declarations)
		.toContain('### PikaCSS Preview')
	expect(contribution?.declarations)
		.toContain('.pika-preview:hover {')
	expect(contribution?.declarations)
		.toContain('.pika-preview:nth-child(2) {')
	expect(contribution?.declarations)
		.toContain('@media (min-width: 640px) {')
	expect(contribution?.declarations)
		.toContain('  .pika-preview {')
	expect(diagnostics)
		.toEqual(expect.arrayContaining([
			expect.objectContaining({ code: 'selector-autocomplete-pattern-mismatch' }),
		]))
})

it('isolates selector preview resolution from the runtime cache and diagnoses preview-only failures', async () => {
	let resolveCalls = 0
	const diagnostics: Array<{ code: string }> = []
	const engine = await createEngine({
		selectors: {
			definitions: [
				{
					pattern: /^nth-(\d+)$/,
					inputType: '`nth-$' + '{number}`',
					autocomplete: ['nth-3'],
					resolve: (matched) => {
						resolveCalls++
						return `$:nth-child(${matched[1]})`
					},
				},
				{
					pattern: /^broken$/,
					inputType: '"broken"',
					autocomplete: ['broken'],
					resolve: () => {
						throw new Error('preview exploded')
					},
				},
			],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

	// Finalization resolves the concrete member once through a disposable resolver.
	expect(resolveCalls)
		.toBe(1)
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:selectors')!.declarations!
	expect(declarations)
		.toContain('"nth-3"?: __StyleDefinition')
	expect(declarations)
		.toContain('.pika-preview:nth-child(3) {')
	expect(declarations)
		.toContain('"broken"?: __StyleDefinition')
	expect(diagnostics)
		.toContainEqual(expect.objectContaining({ code: 'selector-preview-resolution-error' }))

	// Runtime resolution still executes once, proving preview did not seed its resolver cache.
	await engine.pluginHooks.transformSelectors(engine.config.plugins, ['nth-3'])
	await engine.pluginHooks.transformSelectors(engine.config.plugins, ['nth-3'])
	expect(resolveCalls)
		.toBe(2)
})

it('keeps selector previews available when recursive resolution reports a cycle', async () => {
	const diagnostics: Array<{ code: string }> = []
	const engine = await createEngine({
		selectors: {
			definitions: [
				{ name: 'cycle-a', value: 'cycle-b' },
				{ name: 'cycle-b', value: 'cycle-a' },
			],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:selectors')!.declarations!
	expect(declarations)
		.toContain('"cycle-a"?: __StyleDefinition')
	expect(declarations)
		.toContain('"cycle-b"?: __StyleDefinition')
	expect(declarations)
		.toContain('.pika-preview {')
	expect(diagnostics)
		.toContainEqual(expect.objectContaining({ code: 'resolver-circular-reference' }))
})

it('finalizes selector autocomplete members appended by a later plugin configureEngine hook', async () => {
	const concrete: string[] = []
	const producer = defineEnginePlugin({
		name: 'test:late-selector-corpus',
		configureRawConfig(config) {
			config.selectors = {
				definitions: [
					...(config.selectors?.definitions ?? []),
					{
						pattern: /^late-(\w+)$/,
						inputType: '`late-$' + '{string}`',
						autocomplete: concrete,
						resolve: matched => `$[data-late="${matched[1]}"]`,
					},
				],
			}
		},
		configureEngine() {
			concrete.push('late-ready')
		},
	})
	const engine = await createEngine({ plugins: [producer] })
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:selectors')!.declarations!

	expect(declarations)
		.toContain('"late-ready"?: __StyleDefinition')
	expect(declarations)
		.toContain('.pika-preview[data-late="ready"] {')
})

it('binds selector previews to the correct member and includes downstream selector transforms', async () => {
	const downstream = defineEnginePlugin({
		name: 'test:selector-preview-downstream',
		transformSelectors(selectors) {
			return selectors.map((selector) => {
				if (selector === '$:hover')
					return 'html.dark $:hover'
				if (selector === '$:nth-child(2)')
					return 'section.grid $:nth-child(2)'
				return selector
			})
		},
	})
	const engine = await createEngine({
		selectors: {
			definitions: [
				{ name: 'hover', value: '$:hover', description: 'Hover docs' },
				{
					pattern: /^nth-(\d+)$/,
					inputType: '`nth-$' + '{number}`',
					autocomplete: ['nth-2'],
					resolve: matched => `$:nth-child(${matched[1]})`,
					description: 'Nth docs',
				},
			],
		},
		plugins: [downstream],
	})

	expect(await engine.pluginHooks.transformSelectors(engine.config.plugins, ['hover']))
		.toEqual(['html.dark $:hover'])
	expect(await engine.pluginHooks.transformSelectors(engine.config.plugins, ['nth-2']))
		.toEqual(['section.grid $:nth-child(2)'])
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:selectors')!.declarations!
	const hoverMember = declarations.indexOf('"hover"?: __StyleDefinition')
	const hoverDocs = declarations.slice(declarations.lastIndexOf('/**', hoverMember), hoverMember)
	expect(hoverDocs)
		.toContain('Hover docs')
	expect(hoverDocs)
		.toContain('html.dark .pika-preview:hover {')
	expect(hoverDocs.indexOf('Hover docs'))
		.toBeLessThan(hoverDocs.indexOf('### PikaCSS Preview'))

	const nthMember = declarations.indexOf('"nth-2"?: __StyleDefinition')
	const nthDocs = declarations.slice(declarations.lastIndexOf('/**', nthMember), nthMember)
	expect(nthDocs)
		.toContain('Nth docs')
	expect(nthDocs)
		.toContain('section.grid .pika-preview:nth-child(2) {')
	expect(nthDocs).not.toContain('html.dark')
	expect(nthDocs.indexOf('Nth docs'))
		.toBeLessThan(nthDocs.indexOf('### PikaCSS Preview'))
})

it('freezes finalized selector declaration semantics against later raw-config mutation', async () => {
	const engine = await createEngine({
		selectors: {
			definitions: [
				{ name: 'hover', value: '$:hover', description: 'Stable hover' },
				{
					pattern: /^nth-(\d+)$/,
					inputType: '`nth-$' + '{number}`',
					autocomplete: ['nth-2'],
					resolve: matched => `$:nth-child(${matched[1]})`,
				},
			],
		},
	})
	const render = () => renderTypegenDocument([{
		fnName: 'pika',
		publicModule: '@pikacss/core',
		transformedFormat: 'string',
		snapshot: engine.typegen.snapshot,
	}])
	const before = render()
	const definitions = engine.config.rawConfig.selectors!.definitions
	;(definitions[0] as any).name = 'mutated-hover'
	;(definitions[0] as any).description = 'Mutated docs'
	;(definitions[1] as any).inputType = '"mutated"'
	;(definitions[1] as any).autocomplete.push('nth-99')

	expect(render())
		.toBe(before)
})

it('uses static selector precedence for both resolved preview and authored documentation', async () => {
	const engine = await createEngine({
		selectors: {
			definitions: [
				{
					pattern: /^same$/,
					inputType: '"same"',
					autocomplete: ['same'],
					resolve: () => '$:hover',
					description: 'Dynamic docs',
				},
				{ name: 'same', value: '$:focus', description: 'Static docs' },
			],
		},
	})
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:selectors')!.declarations!
	const member = declarations.indexOf('"same"?: __StyleDefinition')
	const docs = declarations.slice(declarations.lastIndexOf('/**', member), member)

	expect(docs)
		.toContain('Static docs')
	expect(docs).not.toContain('Dynamic docs')
	expect(docs)
		.toContain('.pika-preview:focus {')
	expect(docs).not.toContain('.pika-preview:hover {')
})

it('keeps a selector member when a non-Error preview failure occurs', async () => {
	const diagnostics: Array<{ code: string, message: string }> = []
	const engine = await createEngine({
		selectors: {
			definitions: [{
				pattern: /^boom$/,
				inputType: '"boom"',
				autocomplete: ['boom'],
				resolve: () => {
					// eslint-disable-next-line no-throw-literal -- regression: preserve non-Error preview failures
					throw 'selector string boom'
				},
			}],
		},
	}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })
	const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:selectors')!.declarations!

	expect(declarations)
		.toContain('"boom"?: __StyleDefinition')
	expect(diagnostics)
		.toContainEqual(expect.objectContaining({
			code: 'selector-preview-resolution-error',
			message: expect.stringContaining('selector string boom'),
		}))
})
