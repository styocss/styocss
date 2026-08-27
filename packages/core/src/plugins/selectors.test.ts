import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'
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
		.toContain('Hover docs')
	expect(diagnostics)
		.toEqual(expect.arrayContaining([
			expect.objectContaining({ code: 'selector-autocomplete-pattern-mismatch' }),
		]))
})
