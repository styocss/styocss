import type { SelectorConfig } from '../../../src/core-plugin/types'
import type { ResolvedEngineConfig } from '../../../src/internal/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appendAutocompleteSelectors } from '../../../src/helpers'
import { resolvePlugins } from '../../../src/internal/plugin'
import { resolveSelectorConfig, selectors } from '../../../src/internal/selectors'

// Mock helper functions
vi.mock('../../../src/helpers', () => ({
	appendAutocompleteSelectors: vi.fn(),
}))

describe('core-plugin/selectors', () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	describe('resolveSelectorConfig function', () => {
		it('should handle string configuration', () => {
			const config = 'test-selector'
			const result = resolveSelectorConfig(config)
			expect(result).toBe('test-selector')
		})

		it('should handle static selector configuration in array format [string, string]', () => {
			const config: SelectorConfig = ['test-selector', '.test-class']
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'static',
				rule: {
					key: 'test-selector',
					string: 'test-selector',
					resolved: ['.test-class'],
				},
				autocomplete: ['test-selector'],
			})
		})

		it('should handle static selector configuration in array format [string, string[]]', () => {
			const config: SelectorConfig = ['test-selector', ['.test-class-1', '.test-class-2']]
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'static',
				rule: {
					key: 'test-selector',
					string: 'test-selector',
					resolved: ['.test-class-1', '.test-class-2'],
				},
				autocomplete: ['test-selector'],
			})
		})

		it('should handle dynamic selector configuration in array format [RegExp, Function]', () => {
			const regex = /^test-(.+)$/
			const fn = (match: RegExpMatchArray) => `.test-${match[1]}`
			const config: SelectorConfig = [regex, fn]
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'dynamic',
				rule: {
					key: '^test-(.+)$',
					stringPattern: regex,
					createResolved: expect.any(Function),
				},
				autocomplete: [],
			})
		})

		it('should handle dynamic selector configuration in array format [RegExp, Function, string]', () => {
			const regex = /^test-(.+)$/
			const fn = (match: RegExpMatchArray) => `.test-${match[1]}`
			const config: SelectorConfig = [regex, fn, 'test-']
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'dynamic',
				rule: {
					key: '^test-(.+)$',
					stringPattern: regex,
					createResolved: expect.any(Function),
				},
				autocomplete: ['test-'],
			})
		})

		it('should handle dynamic selector configuration in array format [RegExp, Function, string[]]', () => {
			const regex = /^test-(.+)$/
			const fn = (match: RegExpMatchArray) => `.test-${match[1]}`
			const config: SelectorConfig = [regex, fn, ['test-a', 'test-b']]
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'dynamic',
				rule: {
					key: '^test-(.+)$',
					stringPattern: regex,
					createResolved: expect.any(Function),
				},
				autocomplete: ['test-a', 'test-b'],
			})
		})

		it('should handle static selector configuration in object format', () => {
			const config = {
				selector: 'test-selector',
				value: '.test-class',
			}
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'static',
				rule: {
					key: 'test-selector',
					string: 'test-selector',
					resolved: ['.test-class'],
				},
				autocomplete: ['test-selector'],
			})
		})

		it('should handle static selector configuration in object format (with array values)', () => {
			const config = {
				selector: 'test-selector',
				value: ['.test-class-1', '.test-class-2'],
			}
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'static',
				rule: {
					key: 'test-selector',
					string: 'test-selector',
					resolved: ['.test-class-1', '.test-class-2'],
				},
				autocomplete: ['test-selector'],
			})
		})

		it('should handle dynamic selector configuration in object format', () => {
			const regex = /^test-(.+)$/
			const fn = (match: RegExpMatchArray) => `.test-${match[1]}`
			const config = {
				selector: regex,
				value: fn,
			}
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'dynamic',
				rule: {
					key: '^test-(.+)$',
					stringPattern: regex,
					createResolved: expect.any(Function),
				},
				autocomplete: [],
			})
		})

		it('should handle dynamic selector configuration in object format (with autocomplete)', () => {
			const regex = /^test-(.+)$/
			const fn = (match: RegExpMatchArray) => `.test-${match[1]}`
			const config = {
				selector: regex,
				value: fn,
				autocomplete: 'test-',
			}
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'dynamic',
				rule: {
					key: '^test-(.+)$',
					stringPattern: regex,
					createResolved: expect.any(Function),
				},
				autocomplete: ['test-'],
			})
		})

		it('should handle dynamic selector configuration in object format (with array autocomplete)', () => {
			const regex = /^test-(.+)$/
			const fn = (match: RegExpMatchArray) => `.test-${match[1]}`
			const config = {
				selector: regex,
				value: fn,
				autocomplete: ['test-a', 'test-b'],
			}
			const result = resolveSelectorConfig(config)
			expect(result).toEqual({
				type: 'dynamic',
				rule: {
					key: '^test-(.+)$',
					stringPattern: regex,
					createResolved: expect.any(Function),
				},
				autocomplete: ['test-a', 'test-b'],
			})
		})

		it('should return undefined when the configuration is invalid', () => {
			const config = {} as any
			const result = resolveSelectorConfig(config)
			expect(result).toBeUndefined()
		})

		it('should handle createResolved function in dynamic selector', async () => {
			const regex = /^test-(.+)$/
			const fn = (match: RegExpMatchArray) => `.test-${match[1]}`
			const config: SelectorConfig = [regex, fn, 'test-']
			const result = resolveSelectorConfig(config) as { type: 'dynamic', rule: any }
			expect(result.type).toBe('dynamic')

			const match = 'test-example'.match(regex) as RegExpMatchArray
			const resolved = await result.rule.createResolved(match)
			expect(resolved).toEqual(['.test-example'])
		})

		it('should handle createResolved function returning arrays in dynamic selector', async () => {
			const regex = /^test-(.+)$/
			const fn = (match: RegExpMatchArray) => [`.test-${match[1]}-1`, `.test-${match[1]}-2`]
			const config: SelectorConfig = [regex, fn, 'test-']
			const result = resolveSelectorConfig(config) as { type: 'dynamic', rule: any }
			expect(result.type).toBe('dynamic')

			const match = 'test-example'.match(regex) as RegExpMatchArray
			const resolved = await result.rule.createResolved(match)
			expect(resolved).toEqual(['.test-example-1', '.test-example-2'])
		})
	})

	describe('selectorResolver class', () => {
		it('should resolve and expand nested selectors', async () => {
			const pluginDef = selectors()
			const plugins = resolvePlugins([pluginDef])
			const plugin = plugins[0]
			if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved || !plugin.transformSelectors) {
				throw new Error('Plugin initialization failed')
			}

			// Configure settings
			plugin.beforeConfigResolving({
				selectors: [
					['btn', '.btn'],
					['red', '.text-red'],
					['btn-red', ['btn', 'red']], // Modified to array format, indicating dependency on the two selectors above
				],
			})
			plugin.configResolved({} as ResolvedEngineConfig)

			// Test selector transformation
			const result = await plugin.transformSelectors(['btn-red'])
			expect(result).toEqual(['.btn', '.text-red'])
		})

		it('should return the original selector when no match is found', async () => {
			const pluginDef = selectors()
			const plugins = resolvePlugins([pluginDef])
			const plugin = plugins[0]
			if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved || !plugin.transformSelectors) {
				throw new Error('Plugin initialization failed')
			}

			plugin.beforeConfigResolving({ selectors: [] })
			plugin.configResolved({} as ResolvedEngineConfig)

			const result = await plugin.transformSelectors(['unknown-selector'])
			expect(result).toEqual(['unknown-selector'])
		})

		it('should handle dynamic selector configurations', async () => {
			const pluginDef = selectors()
			const plugins = resolvePlugins([pluginDef])
			const plugin = plugins[0]
			if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved || !plugin.transformSelectors) {
				throw new Error('Plugin initialization failed')
			}

			plugin.beforeConfigResolving({
				selectors: [
					[/^color-(.+)$/, (match: RegExpMatchArray) => `.text-${match[1]}`, 'color-'],
				],
			})
			plugin.configResolved({} as ResolvedEngineConfig)

			const result = await plugin.transformSelectors(['color-blue'])
			expect(result).toEqual(['.text-blue'])
		})

		it('should handle multiple selectors', async () => {
			const pluginDef = selectors()
			const plugins = resolvePlugins([pluginDef])
			const plugin = plugins[0]
			if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved || !plugin.transformSelectors) {
				throw new Error('Plugin initialization failed')
			}

			plugin.beforeConfigResolving({
				selectors: [
					['btn', '.btn'],
					['primary', '.primary'],
				],
			})
			plugin.configResolved({} as ResolvedEngineConfig)

			const result = await plugin.transformSelectors(['btn', 'primary'])
			expect(result).toEqual(['.btn', '.primary'])
		})
	})

	describe('selectors plugin', () => {
		it('should create a plugin with the correct name', () => {
			const pluginDef = selectors()
			const plugins = resolvePlugins([pluginDef])
			expect(plugins[0]?.name).toBe('core:selectors')
		})

		describe('beforeConfigResolving hook', () => {
			it('should set the selector list from the configuration', () => {
				const pluginDef = selectors()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving) {
					throw new Error('Plugin initialization failed')
				}

				const config = {
					selectors: [
						['btn', '.btn'],
					] satisfies SelectorConfig[],
				}
				plugin.beforeConfigResolving(config)
				// Since the variable is private, we will verify the results using transformSelectors in subsequent tests
			})

			it('should handle undefined selectors', () => {
				const pluginDef = selectors()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving) {
					throw new Error('Plugin initialization failed')
				}

				const config = {}
				plugin.beforeConfigResolving(config)
				// Since the variable is private, we will verify the results using transformSelectors in subsequent tests
			})
		})

		describe('configResolved hook', () => {
			it('should add autocomplete for selectors', () => {
				const pluginDef = selectors()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved) {
					throw new Error('Plugin initialization failed')
				}

				plugin.beforeConfigResolving({
					selectors: [
						['btn', '.btn'],
						['red', '.text-red'],
						[/^color-(.+)$/, (match: RegExpMatchArray) => `.text-${match[1]}`, 'color-'],
						{
							selector: 'primary',
							value: '.btn-primary',
						},
						'direct-selector',
					],
				})

				const mockConfig = {} as ResolvedEngineConfig
				plugin.configResolved(mockConfig)

				expect(appendAutocompleteSelectors).toHaveBeenCalledWith(mockConfig, 'btn')
				expect(appendAutocompleteSelectors).toHaveBeenCalledWith(mockConfig, 'red')
				expect(appendAutocompleteSelectors).toHaveBeenCalledWith(mockConfig, 'color-')
				expect(appendAutocompleteSelectors).toHaveBeenCalledWith(mockConfig, 'primary')
				expect(appendAutocompleteSelectors).toHaveBeenCalledWith(mockConfig, 'direct-selector')
			})

			it('should ignore invalid configurations', () => {
				const pluginDef = selectors()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved) {
					throw new Error('Plugin initialization failed')
				}

				plugin.beforeConfigResolving({
					selectors: [
						{} as any, // Invalid configuration
					],
				})

				const mockConfig = {} as ResolvedEngineConfig
				plugin.configResolved(mockConfig)

				expect(appendAutocompleteSelectors).not.toHaveBeenCalled()
			})
		})

		describe('transformSelectors hook', () => {
			it('should correctly transform selectors', async () => {
				const pluginDef = selectors()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.configResolved || !plugin.transformSelectors) {
					throw new Error('Plugin initialization failed')
				}

				plugin.beforeConfigResolving({
					selectors: [
						['btn', '.btn'],
						['primary', '.btn-primary'],
					],
				})

				plugin.configResolved({} as ResolvedEngineConfig)

				const result = await plugin.transformSelectors(['btn', 'primary'])
				expect(result).toEqual(['.btn', '.btn-primary'])
			})
		})
	})
})
