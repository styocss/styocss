import { describe, expect, it } from 'vitest'

import { createPrivateAssetVariableName, decodePrivateAssetSegment, encodePrivateAssetSegment } from './private-assets'

describe('icons private asset identity', () => {
	it('keeps common Iconify segments readable', () => {
		expect(encodePrivateAssetSegment('mdi'))
			.toBe('mdi')
		expect(encodePrivateAssetSegment('account-circle'))
			.toBe('account-circle')
		expect(createPrivateAssetVariableName('mdi', 'account-circle'))
			.toBe('--pk-svg-icon-mdi--account-circle')
		expect(createPrivateAssetVariableName('mdi', 'account-circle', 'A'))
			.toBe('--pk-A-svg-icon-mdi--account-circle')
		expect(createPrivateAssetVariableName('mdi', 'account-circle', 'A_B'))
			.toBe('--pk-A_u5f_B-svg-icon-mdi--account-circle')
	})

	it('is reversible and never admits the reserved raw double-hyphen boundary inside a segment', () => {
		const values = [
			'a--b',
			'a-_u2d_b',
			'under_score',
			'ümlaut',
			'emoji-😀',
			'-leading',
			'trailing-',
		]
		const encoded = values.map(encodePrivateAssetSegment)
		expect(new Set(encoded).size)
			.toBe(values.length)
		for (let index = 0; index < values.length; index++) {
			expect(encoded[index])
				.not.toContain('--')
			expect(decodePrivateAssetSegment(encoded[index]!))
				.toBe(values[index])
		}
	})

	it('rejects malformed escape syntax when decoding', () => {
		expect(() => decodePrivateAssetSegment('_uXYZ_'))
			.toThrow('Invalid encoded icon private-asset segment')
		expect(() => decodePrivateAssetSegment('_u61'))
			.toThrow('Invalid encoded icon private-asset segment')
		expect(() => decodePrivateAssetSegment('_'))
			.toThrow('Invalid encoded icon private-asset segment')
	})
})
