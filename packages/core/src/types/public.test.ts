import type { Properties } from './public'
import { describe, expect, it } from 'vitest'

describe('Properties numeric CSS values', () => {
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