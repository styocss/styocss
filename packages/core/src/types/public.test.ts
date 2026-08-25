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
