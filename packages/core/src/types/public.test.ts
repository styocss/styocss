import type { Engine } from '../engine'
import type { Selector } from '../plugins/selectors'
import type { Shortcut } from '../plugins/shortcuts'
import type { Properties } from './public'
import type { DistributiveGetValue, GetValue, IsEqual } from './utils'
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

describe('distributive Typegen value lookup', () => {
	it('adds values across object-union contributors without changing GetValue semantics', () => {
		type Contributors = { color: 'a' } | { color: 'b', display: 'grid' }
		type Legacy = IsEqual<GetValue<Contributors, 'display'>, never>
		type AdditiveColor = IsEqual<DistributiveGetValue<Contributors, 'color'>, 'a' | 'b'>
		type AdditiveDisplay = IsEqual<DistributiveGetValue<Contributors, 'display'>, 'grid'>
		const legacy: Legacy = true
		const additiveColor: AdditiveColor = true
		const additiveDisplay: AdditiveDisplay = true
		expect([legacy, additiveColor, additiveDisplay])
			.toEqual([true, true, true])
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
