import { describe, expect, it } from 'vitest'
import {
	appendAutocompleteCssPropertyValues,
	appendAutocompleteExtraCssProperties,
	appendAutocompleteExtraProperties,
	appendAutocompletePropertyValues,
	appendAutocompleteSelectors,
	appendAutocompleteStyleItemStrings,
} from '../../src/helpers'

function createEmptyConfig() {
	return {
		autocomplete: {
			selectors: new Set<string>(),
			styleItemStrings: new Set<string>(),
			extraProperties: new Set<string>(),
			extraCssProperties: new Set<string>(),
			properties: new Map<string, string[]>(),
			cssProperties: new Map<string, (string | number)[]>(),
		},
	}
}

describe('test helpers', () => {
	describe('test appendAutocompleteSelectors', () => {
		it('should append selectors to config', () => {
			const config = createEmptyConfig()
			appendAutocompleteSelectors(config, '.test1', '.test2')
			expect(config.autocomplete.selectors.has('.test1')).toBe(true)
			expect(config.autocomplete.selectors.has('.test2')).toBe(true)
			expect(config.autocomplete.selectors.size).toBe(2)
		})
	})

	describe('test appendAutocompleteStyleItemStrings', () => {
		it('should append style item strings to config', () => {
			const config = createEmptyConfig()
			appendAutocompleteStyleItemStrings(config, 'style1', 'style2')
			expect(config.autocomplete.styleItemStrings.has('style1')).toBe(true)
			expect(config.autocomplete.styleItemStrings.has('style2')).toBe(true)
			expect(config.autocomplete.styleItemStrings.size).toBe(2)
		})
	})

	describe('test appendAutocompleteExtraProperties', () => {
		it('should append extra properties to config', () => {
			const config = createEmptyConfig()
			appendAutocompleteExtraProperties(config, 'prop1', 'prop2')
			expect(config.autocomplete.extraProperties.has('prop1')).toBe(true)
			expect(config.autocomplete.extraProperties.has('prop2')).toBe(true)
			expect(config.autocomplete.extraProperties.size).toBe(2)
		})
	})

	describe('test appendAutocompleteExtraCssProperties', () => {
		it('should append extra CSS properties to config', () => {
			const config = createEmptyConfig()
			appendAutocompleteExtraCssProperties(config, 'css-prop1', 'css-prop2')
			expect(config.autocomplete.extraCssProperties.has('css-prop1')).toBe(true)
			expect(config.autocomplete.extraCssProperties.has('css-prop2')).toBe(true)
			expect(config.autocomplete.extraCssProperties.size).toBe(2)
		})
	})

	describe('test appendAutocompletePropertyValues', () => {
		it('should append property values to config', () => {
			const config = createEmptyConfig()
			appendAutocompletePropertyValues(config, 'display', 'flex', 'block')
			const values = config.autocomplete.properties.get('display')
			expect(values).toEqual(['flex', 'block'])

			// Test appending to existing values
			appendAutocompletePropertyValues(config, 'display', 'grid')
			const updatedValues = config.autocomplete.properties.get('display')
			expect(updatedValues).toEqual(['flex', 'block', 'grid'])
		})
	})

	describe('test appendAutocompleteCssPropertyValues', () => {
		it('should append CSS property values to config', () => {
			const config = createEmptyConfig()
			appendAutocompleteCssPropertyValues(config, 'z-index', 0, 1, 'auto')
			const values = config.autocomplete.cssProperties.get('z-index')
			expect(values).toEqual([0, 1, 'auto'])

			// Test appending to existing values
			appendAutocompleteCssPropertyValues(config, 'z-index', -1)
			const updatedValues = config.autocomplete.cssProperties.get('z-index')
			expect(updatedValues).toEqual([0, 1, 'auto', -1])
		})
	})
})
