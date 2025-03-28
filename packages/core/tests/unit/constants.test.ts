import { describe, expect, it } from 'vitest'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL,
	DEFAULT_SELECTOR_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from '../../src/internal/constants'

describe('test constants', () => {
	describe('test ATOMIC_STYLE_NAME_PLACEHOLDER', () => {
		it('should be "&"', () => {
			expect(ATOMIC_STYLE_NAME_PLACEHOLDER).toBe('&')
		})
	})

	describe('test aTOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL', () => {
		it('should be a global RegExp matching "&"', () => {
			expect(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL).toBeInstanceOf(RegExp)
			expect(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL.global).toBe(true)
			expect(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL.source).toBe('&')
		})

		it('should match all occurrences of "&"', () => {
			const testString = 'prefix&middle&suffix'
			const matches = testString.match(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL)
			expect(matches).toHaveLength(2)
			expect(matches).toEqual(['&', '&'])
		})
	})

	describe('test DEFAULT_SELECTOR_PLACEHOLDER', () => {
		it('should be "&&"', () => {
			expect(DEFAULT_SELECTOR_PLACEHOLDER).toBe('&&')
		})
	})

	describe('test DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL', () => {
		it('should be a global RegExp matching "&&"', () => {
			expect(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL).toBeInstanceOf(RegExp)
			expect(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL.global).toBe(true)
			expect(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL.source).toBe('&&')
		})

		it('should match all occurrences of "&&"', () => {
			const testString = 'prefix&&middle&&suffix'
			const matches = testString.match(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL)
			expect(matches).toHaveLength(2)
			expect(matches).toEqual(['&&', '&&'])
		})
	})
})
