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
		// Runtime hits no longer mutate global autocomplete state.
		expect(engine.config.autocomplete.selectors.has('child-3'))
			.toBe(false)
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
