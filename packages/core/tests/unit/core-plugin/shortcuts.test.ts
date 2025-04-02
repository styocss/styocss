import type { StyleDefinition, StyleItem } from '../../../src/internal/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	appendAutocompleteExtraProperties,
	appendAutocompletePropertyValues,
	appendAutocompleteStyleItemStrings,
} from '../../../src/helpers'
import { shortcuts } from '../../../src/internal/shortcuts'
import {
	commonShortcuts,
	commonStyleObjects,
	dynamicShortcuts,
} from '../../test-fixtures'
import {
	initAndGetPlugin,
	setupPluginWithConfig,
} from '../../test-utils'

// 使用共同的模擬函數設置
vi.mock('../../../src/helpers', () => ({
	appendAutocompleteExtraProperties: vi.fn(),
	appendAutocompletePropertyValues: vi.fn(),
	appendAutocompleteStyleItemStrings: vi.fn(),
}))

describe('core-plugin/shortcuts', () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	describe('shortcuts plugin', () => {
		it('should create plugin with correct name', () => {
			const plugin = initAndGetPlugin(shortcuts)
			expect(plugin.name).toBe('core:shortcuts')
		})

		describe('beforeConfigResolving hook', () => {
			it('should handle undefined shortcuts config', async () => {
				const { mockConfig } = setupPluginWithConfig(shortcuts, {})
				expect(appendAutocompleteExtraProperties).toHaveBeenCalledWith(mockConfig, '__shortcut')
			})
		})

		describe('configResolved hook', () => {
			it('should handle string shortcuts', () => {
				const { mockConfig } = setupPluginWithConfig(shortcuts, {
					shortcuts: ['btn'],
				})
				expect(appendAutocompleteStyleItemStrings).toHaveBeenCalled()
				expect(appendAutocompleteExtraProperties).toHaveBeenCalledWith(mockConfig, '__shortcut')
			})

			it('should handle array-style static shortcuts', () => {
				const { mockConfig } = setupPluginWithConfig(shortcuts, {
					shortcuts: [['btn', ['p-2', 'rounded', 'bg-blue-500']]],
				})
				expect(appendAutocompleteStyleItemStrings).toHaveBeenCalled()
				const unionTypeArg = expect.stringContaining('\'btn\'')
				expect(appendAutocompletePropertyValues).toHaveBeenCalledWith(
					mockConfig,
					'__shortcut',
					unionTypeArg,
					expect.any(String),
				)
			})

			it('should handle array-style dynamic shortcuts with RegExp', () => {
				const { mockConfig } = setupPluginWithConfig(shortcuts, {
					shortcuts: [[/^btn-(.+)$/, (match: any) => [`p-2`, `rounded`, `bg-${match[1]}`], ['btn-primary', 'btn-secondary']]],
				})
				expect(appendAutocompleteStyleItemStrings).toHaveBeenCalled()
				const unionTypeArg = expect.stringContaining('\'btn-primary\'')
				expect(appendAutocompletePropertyValues).toHaveBeenCalledWith(
					mockConfig,
					'__shortcut',
					unionTypeArg,
					expect.any(String),
				)
			})

			it('should handle object-style static shortcuts', () => {
				const { mockConfig } = setupPluginWithConfig(shortcuts, {
					shortcuts: [
						{
							shortcut: 'card',
							value: ['p-4', 'rounded', 'shadow'],
						},
					],
				})
				expect(appendAutocompleteStyleItemStrings).toHaveBeenCalled()
				const unionTypeArg = expect.stringContaining('\'card\'')
				expect(appendAutocompletePropertyValues).toHaveBeenCalledWith(
					mockConfig,
					'__shortcut',
					unionTypeArg,
					expect.any(String),
				)
			})

			it('should handle object-style dynamic shortcuts with RegExp', () => {
				const { mockConfig } = setupPluginWithConfig(shortcuts, {
					shortcuts: [
						{
							shortcut: /^size-(.+)$/,
							value: (match: any) => [`w-${match[1]}`, `h-${match[1]}`],
							autocomplete: ['size-xs', 'size-sm', 'size-md', 'size-lg'],
						},
					],
				})
				expect(appendAutocompleteStyleItemStrings).toHaveBeenCalled()
				const unionTypeArg = expect.stringContaining('\'size-xs\'')
				expect(appendAutocompletePropertyValues).toHaveBeenCalledWith(
					mockConfig,
					'__shortcut',
					unionTypeArg,
					expect.any(String),
				)
			})

			it('should throw error on invalid shortcut config', () => {
				const plugin = initAndGetPlugin(shortcuts)
				plugin.beforeConfigResolving({ shortcuts: [{}] })
				const mockConfig = {
					rawConfig: {},
					prefix: '',
					defaultSelector: '.&',
					plugins: [],
					preflights: [],
					autocomplete: {
						selectors: new Set(),
						styleItemStrings: new Set(),
						extraProperties: new Set(),
						extraCssProperties: new Set(),
						properties: new Map(),
						cssProperties: new Map(),
					},
				}
				expect(() => plugin.configResolved?.(mockConfig)).toThrow('Invalid shortcut config')
			})
		})

		describe('transformStyleItems hook', () => {
			it('should transform string style items into their resolved values', async () => {
				const { plugin } = setupPluginWithConfig(shortcuts, {
					shortcuts: [
						['btn', ['p-2', 'rounded']],
						['btn-primary', ['btn', 'bg-blue-500']],
					],
				})

				if (!plugin.transformStyleItems)
					throw new Error('transformStyleItems hook not found')

				const styleItems: StyleItem[] = ['btn-primary', { color: 'red' }]
				const result = await plugin.transformStyleItems(styleItems)

				// Should resolve 'btn-primary' to ['p-2', 'rounded', 'bg-blue-500']
				expect(result).toEqual(['p-2', 'rounded', 'bg-blue-500', { color: 'red' }])
			})

			it('should handle dynamic shortcuts with RegExp', async () => {
				const { plugin } = setupPluginWithConfig(shortcuts, {
					shortcuts: dynamicShortcuts,
				})

				if (!plugin.transformStyleItems)
					throw new Error('transformStyleItems hook not found')

				const styleItems: StyleItem[] = ['size-10', { color: 'blue' }]
				const result = await plugin.transformStyleItems(styleItems)

				expect(result).toEqual(['w-10', 'h-10', { color: 'blue' }])
			})

			it('should keep unknown strings as they are', async () => {
				const { plugin } = setupPluginWithConfig(shortcuts, {
					shortcuts: commonShortcuts,
				})

				if (!plugin.transformStyleItems)
					throw new Error('transformStyleItems hook not found')

				const styleItems: StyleItem[] = ['unknown', 'btn']
				const result = await plugin.transformStyleItems(styleItems)

				expect(result).toEqual(['unknown', 'p-2', 'rounded'])
			})
		})

		describe('transformStyleDefinitions hook', () => {
			it('should transform __shortcut property into resolved style definitions', async () => {
				// 使用共享測試物件
				const styleObjectBtn = commonStyleObjects.button
				const styleObjectBgBlue = commonStyleObjects.primary

				const { plugin } = setupPluginWithConfig(shortcuts, {
					shortcuts: [
						['btn', [styleObjectBtn]],
						['btn-primary', ['btn', styleObjectBgBlue]],
					],
				})

				if (!plugin.transformStyleDefinitions)
					throw new Error('transformStyleDefinitions hook not found')

				const styleDefinitions: StyleDefinition[] = [
					{ __shortcut: 'btn-primary', color: 'white' },
				]

				const result = await plugin.transformStyleDefinitions(styleDefinitions)

				// 結果應該包含所有樣式物件以及其他屬性
				expect(result).toContainEqual(styleObjectBtn)
				expect(result).toContainEqual(styleObjectBgBlue)
				expect(result).toContainEqual({ color: 'white' })
			})

			it('should handle array of shortcuts in __shortcut property', async () => {
				const { plugin } = setupPluginWithConfig(shortcuts, {
					shortcuts: [
						['btn', [commonStyleObjects.button]],
						['primary', [commonStyleObjects.primary]],
						['hover', [commonStyleObjects.hover]],
					],
				})

				if (!plugin.transformStyleDefinitions)
					throw new Error('transformStyleDefinitions hook not found')

				const styleDefinitions: StyleDefinition[] = [
					{ __shortcut: ['btn', 'primary', 'hover'], color: 'white' },
				]

				const result = await plugin.transformStyleDefinitions(styleDefinitions)

				// 結果應該包含所有樣式物件以及其他屬性
				expect(result).toContainEqual(commonStyleObjects.button)
				expect(result).toContainEqual(commonStyleObjects.primary)
				expect(result).toContainEqual(commonStyleObjects.hover)
				expect(result).toContainEqual({ color: 'white' })
			})

			it.each([
				{ description: 'null shortcut', input: [{ __shortcut: null, color: 'blue' }], expected: [{ color: 'blue' }] },
				{ description: 'empty array shortcut', input: [{ __shortcut: [], color: 'green' }], expected: [{ color: 'green' }] },
			])('should handle $description properly', async ({ input, expected }) => {
				const { plugin } = setupPluginWithConfig(shortcuts, {
					shortcuts: commonShortcuts,
				})

				if (!plugin.transformStyleDefinitions)
					throw new Error('transformStyleDefinitions hook not found')

				const result = await plugin.transformStyleDefinitions(input)
				expect(result).toEqual(expected)
			})

			it('should pass through style definitions without __shortcut property', async () => {
				const { plugin } = setupPluginWithConfig(shortcuts, {
					shortcuts: commonShortcuts,
				})

				if (!plugin.transformStyleDefinitions)
					throw new Error('transformStyleDefinitions hook not found')

				const styleDefinitions: StyleDefinition[] = [
					{ color: 'blue' },
					{ p: '4' },
				]

				const result = await plugin.transformStyleDefinitions(styleDefinitions)

				expect(result).toEqual([
					{ color: 'blue' },
					{ p: '4' },
				])
			})
		})
	})
})
