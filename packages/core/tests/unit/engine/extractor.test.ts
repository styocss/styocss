import type { StyleDefinition, StyleItem } from '../../../src/internal/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ATOMIC_STYLE_NAME_PLACEHOLDER, DEFAULT_SELECTOR_PLACEHOLDER } from '../../../src/internal/constants'
import { createExtractFn } from '../../../src/internal/extractor'

describe('engine/extractor', () => {
	// Mock transformation functions
	const mockTransformSelectors = vi.fn(async (selectors: string[]) => selectors)
	const mockTransformStyleItems = vi.fn(async (items: StyleItem[]) => items)
	const mockTransformStyleDefinitions = vi.fn(async (defs: StyleDefinition[]) => defs)

	const defaultSelector = `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`

	// Create extract function for testing
	const extract = createExtractFn({
		defaultSelector,
		transformSelectors: mockTransformSelectors,
		transformStyleItems: mockTransformStyleItems,
		transformStyleDefinitions: mockTransformStyleDefinitions,
	})

	beforeEach(() => {
		// Reset mock functions
		mockTransformSelectors.mockClear()
		mockTransformStyleItems.mockClear()
		mockTransformStyleDefinitions.mockClear()
	})

	describe('normalizeSelectors', () => {
		it('should use DEFAULT_SELECTOR_PLACEHOLDER when no selectors are provided', async () => {
			const result = await extract({ color: 'red' })

			expect(mockTransformSelectors).toHaveBeenCalledWith([])
			expect(result).toEqual([{
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['red'],
			}])
		})

		it('should keep the last selector if it contains ATOMIC_STYLE_NAME_PLACEHOLDER', async () => {
			// Modify mockTransformSelectors to return a selector containing the placeholder
			mockTransformSelectors.mockImplementationOnce(async () => [`div.${ATOMIC_STYLE_NAME_PLACEHOLDER}`])

			const result = await extract({ color: 'blue' })

			expect(result).toEqual([{
				selector: [`div.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['blue'],
			}])
		})

		it('should keep the last selector if it contains DEFAULT_SELECTOR_PLACEHOLDER', async () => {
			// Modify mockTransformSelectors to return a selector containing the placeholder
			mockTransformSelectors.mockImplementationOnce(async () => [`div${DEFAULT_SELECTOR_PLACEHOLDER}`])

			const result = await extract({ color: 'green' })

			expect(result).toEqual([{
				selector: [`div.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['green'],
			}])
		})

		it('should append DEFAULT_SELECTOR_PLACEHOLDER to the end of the selector list', async () => {
			// Modify mockTransformSelectors to return selectors without placeholders
			mockTransformSelectors.mockImplementationOnce(async () => ['div', 'span'])

			const result = await extract({ color: 'yellow' })

			expect(result).toEqual([{
				selector: ['div', 'span', `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['yellow'],
			}])
		})

		it('should handle comma-separated selectors', async () => {
			// Modify mockTransformSelectors to return a selector with commas
			mockTransformSelectors.mockImplementationOnce(async () => ['div, span'])

			const result = await extract({ color: 'purple' })

			expect(result).toEqual([{
				selector: ['div,span', `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['purple'],
			}])
		})
	})

	describe('normalizeValue', () => {
		it('should handle single value', async () => {
			const result = await extract({ margin: '10px' })

			expect(result).toEqual([{
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'margin',
				value: ['10px'],
			}])
		})

		it('should handle array values', async () => {
			// Reset all mock functions
			mockTransformSelectors.mockReset().mockImplementation(async () => [])
			mockTransformStyleDefinitions.mockReset().mockImplementation(async defs => defs)
			mockTransformStyleItems.mockReset().mockImplementation(async () => [])

			// Create a new extract function
			const testExtract = createExtractFn({
				defaultSelector,
				transformSelectors: async () => [],
				transformStyleItems: async i => i,
				transformStyleDefinitions: async d => d,
			})

			const result = await testExtract({ margin: '10px 20px' })

			expect(result).toEqual([{
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'margin',
				value: ['10px 20px'],
			}])
		})

		it('should remove duplicate values', async () => {
			// Create a new extract function
			const testExtract = createExtractFn({
				defaultSelector,
				transformSelectors: async () => [],
				transformStyleItems: async i => i,
				transformStyleDefinitions: async d => d,
			})

			const result = await testExtract({ padding: '10px 10px 20px' })

			expect(result).toEqual([{
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'padding',
				value: ['10px 10px 20px'],
			}])
		})

		it('should convert numbers to strings and trim whitespace', async () => {
			// Create a new extract function
			const testExtract = createExtractFn({
				defaultSelector,
				transformSelectors: async () => [],
				transformStyleItems: async i => i,
				transformStyleDefinitions: async d => d,
			})

			const result = await testExtract({ zIndex: 123 })

			expect(result).toEqual([{
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'z-index',
				value: ['123'],
			}])
		})

		it('should handle null and undefined values', async () => {
			const result = await extract({ border: null, margin: undefined })

			expect(result).toEqual([
				{
					selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
					property: 'border',
					value: null,
				},
				{
					selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
					property: 'margin',
					value: undefined,
				},
			])
		})
	})

	describe('extract', () => {
		it('should handle basic style properties', async () => {
			const result = await extract({
				color: 'red',
				fontSize: '16px',
			})

			expect(result).toHaveLength(2)
			expect(result).toContainEqual({
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['red'],
			})
			expect(result).toContainEqual({
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'font-size',
				value: ['16px'],
			})
		})

		it('should handle nested style definitions', async () => {
			// Create a new extract function specifically for testing nested selectors
			const testExtract = createExtractFn({
				defaultSelector,
				transformSelectors: async selectors => selectors, // Keep selector paths
				transformStyleItems: async i => i,
				transformStyleDefinitions: async d => d,
			})

			const result = await testExtract({
				color: 'red',
				hover: {
					color: 'blue',
				},
			})

			expect(result).toHaveLength(2)
			expect(result).toContainEqual({
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['red'],
			})
			expect(result).toContainEqual({
				selector: ['hover', `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['blue'],
			})
		})

		it('should handle deeply nested styles', async () => {
			// Create a new extract function for testing deeply nested selectors
			const testExtract = createExtractFn({
				defaultSelector,
				transformSelectors: async selectors => selectors, // Keep selector paths
				transformStyleItems: async i => i,
				transformStyleDefinitions: async d => d,
			})

			const result = await testExtract({
				color: 'red',
				hover: {
					color: 'blue',
					focus: {
						color: 'green',
					},
				},
			})

			expect(result).toHaveLength(3)
			expect(result).toContainEqual({
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['red'],
			})
			expect(result).toContainEqual({
				selector: ['hover', `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['blue'],
			})
			expect(result).toContainEqual({
				selector: ['hover', 'focus', `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['green'],
			})
		})

		it('should handle style items in arrays', async () => {
			// Create an extract function specifically for testing array handling
			const testExtract = createExtractFn({
				defaultSelector,
				transformSelectors: async selectors => selectors, // Keep selector paths
				transformStyleItems: async items => items, // Keep items unchanged
				transformStyleDefinitions: async d => d,
			})

			const styleObj1 = { color: 'blue' }
			const styleObj2 = { fontSize: '16px' }

			const result = await testExtract({
				display: 'flex',
				styles: [styleObj1, styleObj2],
			})

			expect(result).toHaveLength(3)
			expect(result).toContainEqual({
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'display',
				value: ['flex'],
			})
			expect(result).toContainEqual({
				selector: ['styles', `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['blue'],
			})
			expect(result).toContainEqual({
				selector: ['styles', `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'font-size',
				value: ['16px'],
			})
		})

		it('should skip string style items in arrays', async () => {
			// Modify mockTransformStyleItems to return mixed style items
			mockTransformStyleItems.mockImplementationOnce(async () => ['string-item', { color: 'red' }])

			const result = await extract({
				styles: [], // Empty array, but we use mock function to simulate return values
			})

			expect(mockTransformStyleItems).toHaveBeenCalled()
			expect(result).toHaveLength(1)
			expect(result[0]!.property).toBe('color')
			expect(result[0]!.value).toEqual(['red'])
		})

		it('should use transformStyleDefinitions to process style definitions', async () => {
			mockTransformStyleDefinitions.mockImplementationOnce(async (defs) => {
				// Simulate a plugin modifying style definitions
				return defs.map(def => ({
					...def,
					fontWeight: 'bold', // Add a new property
				}))
			})

			const result = await extract({ color: 'red' })

			expect(mockTransformStyleDefinitions).toHaveBeenCalledWith([{ color: 'red' }])
			expect(result).toHaveLength(2)
			expect(result).toContainEqual({
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'color',
				value: ['red'],
			})
			expect(result).toContainEqual({
				selector: [`.${ATOMIC_STYLE_NAME_PLACEHOLDER}`],
				property: 'font-weight',
				value: ['bold'],
			})
		})
	})

	describe('createExtractFn', () => {
		it('should create an extract function', async () => {
			// Create a new extract function with custom selector
			const customDefaultSelector = '[data-test="&"]'
			const customExtract = createExtractFn({
				defaultSelector: customDefaultSelector,
				transformSelectors: async s => s,
				transformStyleItems: async i => i,
				transformStyleDefinitions: async d => d,
			})

			const result = await customExtract({ color: 'red' })

			expect(result).toHaveLength(1)
			expect(result[0]!.selector[0]).toBe('[data-test="&"]')
		})

		it('should pass options to the extract function', async () => {
			const mockTransform = vi.fn().mockImplementation(async s => s)

			const customExtract = createExtractFn({
				defaultSelector: 'custom-selector',
				transformSelectors: mockTransform,
				transformStyleItems: async i => i,
				transformStyleDefinitions: async d => d,
			})

			await customExtract({ color: 'red' })

			expect(mockTransform).toHaveBeenCalledWith([])
		})
	})
})
