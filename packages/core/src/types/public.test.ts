import type { Engine } from '../engine'
import type { Selector } from '../plugins/selectors'
import type { Shortcut } from '../plugins/shortcuts'
import type { Variable, VariablesDefinition } from '../plugins/variables'
import type { EngineConfig } from './engine'
import type { Properties } from './public'
import { describe, expect, it } from 'vitest'

describe('properties numeric CSS values', () => {
	it('accepts JavaScript numbers only for generated length zero positions', () => {
		const lengthZero: Properties = { margin: 0 }
		const numericStrings: Properties = { opacity: '0.5', zIndex: '10' }

		// @ts-expect-error Non-zero lengths must include their CSS unit in a string.
		const nonZeroLength: Properties = { margin: 8 }
		// @ts-expect-error Numeric CSS grammars remain string-backed in public authoring.
		const numericOpacity: Properties = { opacity: 0.5 }
		// @ts-expect-error Integer CSS grammars remain string-backed in public authoring.
		const numericZIndex: Properties = { zIndex: 10 }
		// @ts-expect-error CSS custom property values remain string-backed.
		const numericCustomProperty: Properties = { '--gap': 0 }

		expect(lengthZero.margin)
			.toBe(0)
		expect(numericStrings)
			.toEqual({ opacity: '0.5', zIndex: '10' })
		expect(nonZeroLength.margin)
			.toBe(8)
		expect(numericOpacity.opacity)
			.toBe(0.5)
		expect(numericZIndex.zIndex)
			.toBe(10)
		expect(numericCustomProperty['--gap'])
			.toBe(0)
	})
})

describe('frozen selector and shortcut authoring grammar', () => {
	it('accepts object-only static/dynamic definitions and rejects legacy producer seams', () => {
		const selectorStatic: Selector = { name: 'hover', value: '$:hover', description: 'Hover' }
		const selectorDynamic: Selector = {
			pattern: /^nth-(\d+)$/,
			inputType: '`nth-$' + '{number}`',
			resolve: matched => `$:nth-child(${matched[1]})`,
			autocomplete: ['nth-2'],
		}
		const shortcutStatic: Shortcut = { name: 'btn', value: { display: 'flex' } }
		const shortcutDynamic: Shortcut = {
			pattern: /^m-(\d+)$/,
			inputType: '`m-$' + '{number}`',
			resolve: matched => ({ margin: `${matched[1]}px` }),
		}

		// @ts-expect-error String shorthand is intentionally removed.
		const legacySelectorString: Selector = 'hover'
		// @ts-expect-error Tuple shorthand is intentionally removed.
		const legacySelectorTuple: Selector = ['hover', '$:hover']
		// @ts-expect-error Tuple shorthand is intentionally removed.
		const legacyShortcutTuple: Shortcut = ['btn', { display: 'flex' }]
		// @ts-expect-error Dynamic definitions require an explicit raw TypeScript inputType.
		const missingInputType: Shortcut = { pattern: /^m-/, resolve: () => ({ margin: '1px' }) }

		const assertRemovedIngress = (engine: Engine) => {
			// @ts-expect-error Config-backed domains expose no public runtime `.add()` ingress.
			void engine.shortcuts
			// @ts-expect-error Config-backed domains expose no public runtime `.add()` ingress.
			void engine.selectors
		}
		void assertRemovedIngress

		expect([selectorStatic, selectorDynamic, shortcutStatic, shortcutDynamic])
			.toHaveLength(4)
		void legacySelectorString
		void legacySelectorTuple
		void legacyShortcutTuple
		void missingInputType
	})
})

describe('frozen variable authoring grammar', () => {
	it('accepts object-only local/external leaves and rejects legacy producer semantics', () => {
		const local: Variable = {
			value: 'red',
			suggest: { asProperty: true, asValueOf: ['color'] },
			description: 'Local variable',
			pruneUnused: false,
		}
		const external: Variable = {
			external: true,
			suggest: { asValueOf: '*' },
			description: 'External variable',
		}
		const nested: VariablesDefinition = {
			'--local': local,
			'.dark': { '--scoped': { value: 'black' } },
			'--external': external,
		}

		// @ts-expect-error Primitive variable leaves are intentionally removed.
		const legacyPrimitive: Variable = 'red'
		// @ts-expect-error Legacy autocomplete metadata is replaced by `suggest`.
		const legacyAutocomplete: Variable = { value: 'red', autocomplete: { asValueOf: '*' } }
		// @ts-expect-error External variables cannot also provide a local value.
		const externalWithValue: Variable = { external: true, value: 'red' }
		// @ts-expect-error External variables do not participate in local pruning ownership.
		const externalWithPruning: Variable = { external: true, pruneUnused: false }

		const assertRemovedIngress = (engine: Engine) => {
			// @ts-expect-error Variables are config-backed and expose no public runtime producer/store API.
			void engine.variables
		}
		void assertRemovedIngress

		expect([local, external, nested])
			.toHaveLength(3)
		void legacyPrimitive
		void legacyAutocomplete
		void externalWithValue
		void externalWithPruning
	})
})

describe('removed global autocomplete architecture', () => {
	it('rejects the legacy config and runtime ingress at compile time', () => {
		// @ts-expect-error Global autocomplete config was replaced by domain-owned Typegen metadata.
		const legacyConfig: EngineConfig = { autocomplete: { selectors: ['hover'] } }
		const assertRemovedRuntime = (engine: Engine) => {
			// @ts-expect-error Runtime autocomplete mutation is intentionally removed.
			void engine.appendAutocomplete
			// @ts-expect-error Runtime autocomplete notification is intentionally removed.
			void engine.notifyAutocompleteConfigUpdated
		}
		void assertRemovedRuntime
		void legacyConfig
		expect(true)
			.toBe(true)
	})
})
