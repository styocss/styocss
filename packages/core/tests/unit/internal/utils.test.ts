import type { ResolvedEngineConfig } from '../../../src/internal/types'
import { describe, expect, it } from 'vitest'
import {
	addToSet,
	appendAutocompleteCssPropertyValues,
	appendAutocompleteExtraCssProperties,
	appendAutocompleteExtraProperties,
	appendAutocompletePropertyValues,
	appendAutocompleteSelectors,
	appendAutocompleteStyleItemStrings,
	isNotNullish,
	isNotString,
	isPropertyValue,
	isString,
	numberToChars,
	serialize,
	toKebab,
} from '../../../src/internal/utils'

function createTestResolvedEngineConfig(): ResolvedEngineConfig {
	return {
		autocomplete: {
			selectors: new Set<string>(),
			styleItemStrings: new Set<string>(),
			extraProperties: new Set<string>(),
			extraCssProperties: new Set<string>(),
			properties: new Map<string, string[]>(),
			cssProperties: new Map<string, (string | number)[]>(),
		},
	} as ResolvedEngineConfig
}

describe('utils', () => {
	describe('numberToChars', () => {
		it('should convert numbers to alphabetic characters', () => {
			expect(numberToChars(0)).toBe('a')
			expect(numberToChars(25)).toBe('z')
			expect(numberToChars(26)).toBe('A')
			expect(numberToChars(51)).toBe('Z')
			expect(numberToChars(52)).toBe('aa')
			expect(numberToChars(53)).toBe('ba')
		})
	})

	describe('toKebab', () => {
		it('should convert camelCase to kebab-case', () => {
			expect(toKebab('camelCase')).toBe('camel-case')
			expect(toKebab('PascalCase')).toBe('-pascal-case')
		})
	})

	describe('isNotNullish', () => {
		it('should return true for non-nullish values', () => {
			expect(isNotNullish(0)).toBe(true)
			expect(isNotNullish('')).toBe(true)
			expect(isNotNullish(false)).toBe(true)
		})

		it('should return false for nullish values', () => {
			expect(isNotNullish(null)).toBe(false)
			expect(isNotNullish(undefined)).toBe(false)
		})
	})

	describe('isString', () => {
		it('should return true for strings', () => {
			expect(isString('test')).toBe(true)
		})

		it('should return false for non-strings', () => {
			expect(isString(123)).toBe(false)
			expect(isString(null)).toBe(false)
		})
	})

	describe('isNotString', () => {
		it('should return true for non-strings', () => {
			expect(isNotString(123)).toBe(true)
			expect(isNotString(null)).toBe(true)
		})

		it('should return false for strings', () => {
			expect(isNotString('test')).toBe(false)
		})
	})

	describe('isPropertyValue', () => {
		it('should validate property values correctly', () => {
			expect(isPropertyValue('value')).toBe(true)
			expect(isPropertyValue(123)).toBe(true)
			expect(isPropertyValue(null)).toBe(true)
			expect(isPropertyValue([123, ['value']])).toBe(true)
			expect(isPropertyValue([123, [123]])).toBe(true)
			expect(isPropertyValue([123, ['value', 123]])).toBe(true)
			// Invalid cases
			// @ts-expect-error for testing
			expect(isPropertyValue([123, 'value'])).toBe(false)
			// @ts-expect-error for testing
			expect(isPropertyValue([123, 123, 456])).toBe(false)
			// @ts-expect-error for testing
			expect(isPropertyValue([123])).toBe(false)
			// @ts-expect-error for testing
			expect(isPropertyValue(true)).toBe(false)
		})
	})

	describe('serialize', () => {
		it('should serialize values to JSON', () => {
			expect(serialize({ key: 'value' })).toBe('{"key":"value"}')
		})
	})

	describe('addToSet', () => {
		it('should add values to a set', () => {
			const set = new Set<number>()
			addToSet(set, 1, 2, 3)
			expect(set.has(1)).toBe(true)
			expect(set.has(2)).toBe(true)
			expect(set.has(3)).toBe(true)
		})
	})

	describe('appendAutocompleteSelectors', () => {
		it('should append selectors to autocomplete config', () => {
			const config = createTestResolvedEngineConfig()
			appendAutocompleteSelectors(config, 'selector1', 'selector2')
			expect(config.autocomplete.selectors.has('selector1')).toBe(true)
			expect(config.autocomplete.selectors.has('selector2')).toBe(true)
		})
	})

	describe('appendAutocompleteStyleItemStrings', () => {
		it('should append style item strings to autocomplete config', () => {
			const config = createTestResolvedEngineConfig()
			appendAutocompleteStyleItemStrings(config, 'style1', 'style2')
			expect(config.autocomplete.styleItemStrings.has('style1')).toBe(true)
			expect(config.autocomplete.styleItemStrings.has('style2')).toBe(true)
		})
	})

	describe('appendAutocompleteExtraProperties', () => {
		it('should append extra properties to autocomplete config', () => {
			const config = createTestResolvedEngineConfig()
			appendAutocompleteExtraProperties(config, 'prop1', 'prop2')
			expect(config.autocomplete.extraProperties.has('prop1')).toBe(true)
			expect(config.autocomplete.extraProperties.has('prop2')).toBe(true)
		})
	})

	describe('appendAutocompleteExtraCssProperties', () => {
		it('should append extra CSS properties to autocomplete config', () => {
			const config = createTestResolvedEngineConfig()
			appendAutocompleteExtraCssProperties(config, 'css1', 'css2')
			expect(config.autocomplete.extraCssProperties.has('css1')).toBe(true)
			expect(config.autocomplete.extraCssProperties.has('css2')).toBe(true)
		})
	})

	describe('appendAutocompletePropertyValues', () => {
		it('should append property values to autocomplete config', () => {
			const config = createTestResolvedEngineConfig()
			appendAutocompletePropertyValues(config, 'prop', 'value1', 'value2')
			expect(config.autocomplete.properties.get('prop')).toEqual(['value1', 'value2'])
		})
	})

	describe('appendAutocompleteCssPropertyValues', () => {
		it('should append CSS property values to autocomplete config', () => {
			const config = createTestResolvedEngineConfig()
			appendAutocompleteCssPropertyValues(config, 'css', 'value1', 123)
			expect(config.autocomplete.cssProperties.get('css')).toEqual(['value1', 123])
		})
	})
})
