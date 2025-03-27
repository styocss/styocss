import type { ResolvedEngineConfig } from '../../../src/engine/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ATOMIC_STYLE_NAME_PLACEHOLDER } from '../../../src/constants'
import * as configModule from '../../../src/engine/config'
import { createEngine, Engine } from '../../../src/engine/engine'
import * as extractorModule from '../../../src/engine/extractor'
import * as plugin from '../../../src/engine/plugin'

// Mock configuration
const mockConfig: ResolvedEngineConfig = {
	rawConfig: {},
	prefix: 'test-',
	defaultSelector: `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
	plugins: [],
	preflights: [
		() => '/* Preflight 1 */',
		() => '/* Preflight 2 */',
	],
	autocomplete: {
		selectors: new Set(),
		styleItemStrings: new Set(),
		extraProperties: new Set(),
		extraCssProperties: new Set(),
		properties: new Map(),
		cssProperties: new Map(),
	},
}

describe('engine/engine', () => {
	// Setup before tests
	beforeEach(() => {
		// Reset all mocks
		vi.resetAllMocks()

		// Mock configuration resolution
		vi.spyOn(configModule, 'resolveEngineConfig').mockResolvedValue(mockConfig)

		// Mock plugin hooks
		vi.spyOn(plugin.hooks, 'config').mockImplementation(async (_, config) => config)
		vi.spyOn(plugin.hooks, 'beforeConfigResolving').mockImplementation((_, config) => config)
		vi.spyOn(plugin.hooks, 'configResolved').mockImplementation(async (_, config) => config)
		vi.spyOn(plugin.hooks, 'transformSelectors').mockImplementation(async (_, selectors) => selectors as string[])
		vi.spyOn(plugin.hooks, 'transformStyleItems').mockImplementation(async (_, items) => items)
		vi.spyOn(plugin.hooks, 'transformStyleDefinitions').mockImplementation(async (_, defs) => defs)
		vi.spyOn(plugin.hooks, 'atomicRuleAdded').mockImplementation(() => {})
	})

	describe('createEngine', () => {
		it('should create an Engine instance with default config', async () => {
			const engine = await createEngine()

			expect(engine).toBeInstanceOf(Engine)
			expect(plugin.hooks.config).toHaveBeenCalled()
			expect(plugin.hooks.beforeConfigResolving).toHaveBeenCalled()
			expect(configModule.resolveEngineConfig).toHaveBeenCalledWith({})
			expect(plugin.hooks.configResolved).toHaveBeenCalled()
		})

		it('should create an Engine instance with custom config', async () => {
			const customConfig = {
				prefix: 'test-',
				defaultSelector: '[data-test="&"]',
				plugins: [{ name: 'test-plugin' }],
			}

			const engine = await createEngine(customConfig)

			expect(engine).toBeInstanceOf(Engine)
			expect(plugin.hooks.config).toHaveBeenCalledWith(expect.anything(), customConfig)
			expect(plugin.hooks.beforeConfigResolving).toHaveBeenCalled()
			expect(configModule.resolveEngineConfig).toHaveBeenCalledWith(customConfig)
			expect(plugin.hooks.configResolved).toHaveBeenCalled()
		})
	})

	describe('engine', () => {
		let engine: Engine
		let mockExtract: ReturnType<typeof vi.fn>

		beforeEach(async () => {
			// Create mockExtract function that returns mock extraction results
			mockExtract = vi.fn().mockImplementation(async () => {
				return [{
					selector: ['.&'],
					property: 'color',
					value: ['red'],
				}]
			})

			// Mock createExtractFn to return mockExtract
			vi.spyOn(extractorModule, 'createExtractFn').mockReturnValue(mockExtract)

			// Create engine instance
			engine = await createEngine()
		})

		describe('constructor', () => {
			it('should initialize with the resolved config', () => {
				expect(engine.config).toBe(mockConfig)
				expect(extractorModule.createExtractFn).toHaveBeenCalledWith({
					defaultSelector: mockConfig.defaultSelector,
					transformSelectors: expect.any(Function),
					transformStyleItems: expect.any(Function),
					transformStyleDefinitions: expect.any(Function),
				})
			})

			it('should initialize store with empty maps', () => {
				expect(engine.store.atomicNames).toBeInstanceOf(Map)
				expect(engine.store.atomicNames.size).toBe(0)
				expect(engine.store.atomicRules).toBeInstanceOf(Map)
				expect(engine.store.atomicRules.size).toBe(0)
			})
		})

		describe('use', () => {
			it('should process style items and return class names', async () => {
				const result = await engine.use({ color: 'red' })

				expect(mockExtract).toHaveBeenCalled()
				expect(result).toHaveLength(1)
				expect(result[0]).toBe('test-a')

				// Check if rules are added to the store
				expect(engine.store.atomicRules.size).toBe(1)
				expect(plugin.hooks.atomicRuleAdded).toHaveBeenCalled()
			})

			it('should handle unknown string style items', async () => {
				// Mock transformStyleItems to return a string item
				vi.spyOn(plugin.hooks, 'transformStyleItems').mockResolvedValueOnce(['unknown-class'])

				const result = await engine.use({})

				expect(result).toHaveLength(1)
				expect(result[0]).toBe('unknown-class')
				expect(engine.store.atomicRules.size).toBe(0)
			})

			it('should reuse existing class names for the same styles', async () => {
				// First use
				await engine.use({ color: 'red' })
				expect(plugin.hooks.atomicRuleAdded).toHaveBeenCalledTimes(1)

				// Clear mock to track second call
				vi.mocked(plugin.hooks.atomicRuleAdded).mockClear()

				// Second use with the same styles
				await engine.use({ color: 'red' })
				// atomicRuleAdded should not be called again
				expect(plugin.hooks.atomicRuleAdded).not.toHaveBeenCalled()
			})

			it('should handle selector arrays in use method', async () => {
				// Mock extraction to return styles with hover selector
				mockExtract.mockResolvedValueOnce([
					{
						selector: ['hover', '.&'],
						property: 'color',
						value: ['blue'],
					},
				])

				const result = await engine.use(['hover', { color: 'blue' }])

				expect(result).toHaveLength(1)
				expect(engine.store.atomicRules.size).toBe(1)

				// Check if the rule is correctly stored
				const rule = engine.store.atomicRules.get(result[0]!)
				expect(rule).toBeDefined()
				expect(rule?.content.selector).toContain('hover')
				expect(rule?.content.property).toBe('color')
			})

			it('should create unique atomic names based on content', async () => {
				// Add two different style rules
				// First rule
				mockExtract.mockResolvedValueOnce([
					{
						selector: ['.&'],
						property: 'color',
						value: ['red'],
					},
				])

				const result1 = await engine.use({ color: 'red' })

				// Second rule
				mockExtract.mockResolvedValueOnce([
					{
						selector: ['.&'],
						property: 'color',
						value: ['blue'],
					},
				])

				const result2 = await engine.use({ color: 'blue' })

				// Should create different class names
				expect(result1[0]).not.toEqual(result2[0])
				expect(engine.store.atomicNames.size).toBe(2)
			})

			it('should optimize atomic style contents by taking latest declaration', async () => {
				// Set multiple declarations for the same property
				mockExtract.mockResolvedValueOnce([
					{
						selector: ['.&'],
						property: 'color',
						value: ['red'],
					},
					{
						selector: ['.&'],
						property: 'color',
						value: ['blue'],
					},
				])

				await engine.use({ color: 'blue' })

				// Only one rule should be stored, using the latest value
				expect(engine.store.atomicRules.size).toBe(1)
				const rule = [...engine.store.atomicRules.values()][0]!
				expect(rule.content.value).toEqual(['blue'])
			})
		})

		describe('renderPreviewStyles', () => {
			it('should render styles in preview mode', async () => {
				const css = await engine.renderPreviewStyles({ color: 'red' })

				expect(css).toBe('.&{color:red}')
				expect(engine.store.atomicRules.size).toBe(1)
			})
		})

		describe('renderStyles', () => {
			it('should combine preflights and atomic rules', async () => {
				// 先添加一些規則到引擎
				await engine.use({ color: 'red' })

				const css = engine.renderStyles()

				expect(css).toBe('/* Preflight 1 *//* Preflight 2 */.test-a{color:red}')
			})
		})

		describe('renderPreflights', () => {
			it('should render all preflights', () => {
				const css = engine.renderPreflights()
				expect(css).toBe('/* Preflight 1 *//* Preflight 2 */')
			})
		})

		describe('renderAtomicRules', () => {
			it('should render atomic rules', async () => {
				// 先添加一些規則到引擎
				await engine.use({ color: 'red' })

				const css = engine.renderAtomicRules()

				expect(css).toBe('.test-a{color:red}')
			})
		})

		describe('nested selectors and CSS generation', () => {
			it('should build correct CSS for nested selectors', async () => {
				mockExtract.mockResolvedValueOnce([
					{
						selector: ['hover', '.&'],
						property: 'color',
						value: ['red'],
					},
					{
						selector: ['hover', 'focus', '.&'],
						property: 'color',
						value: ['blue'],
					},
				])

				await engine.use({ hover: { color: 'red', focus: { color: 'blue' } } })

				const css = engine.renderAtomicRules()

				// 檢查生成的CSS是否包含正確的嵌套選擇器和樣式
				// 使用正則表達式來驗證CSS的結構，而不是檢查確切的字符串
				expect(css).toMatch(/hover\{\.test-a\{color:red\}/)
				expect(css).toMatch(/hover\{.*focus\{\.test-b\{color:blue\}\}\}/)
			})

			it('should handle preview styles correctly', async () => {
				mockExtract.mockResolvedValueOnce([
					{
						selector: ['.&'],
						property: 'color',
						value: ['red'],
					},
					{
						selector: ['hover', '.&'],
						property: 'color',
						value: ['blue'],
					},
				])

				const css = await engine.renderPreviewStyles({ color: 'red' })

				// 在預覽模式下，佔位符應保持不變
				expect(css).toBe('.&{color:red}hover{.&{color:blue}}')
			})

			it('should skip invalid selectors and null values', async () => {
				mockExtract.mockResolvedValueOnce([
					{
						selector: ['invalid-selector'], // 沒有佔位符
						property: 'color',
						value: ['red'],
					},
					{
						selector: ['.&'],
						property: 'border',
						value: null,
					},
				])

				await engine.use({ color: 'red' })

				// 由於所有規則都無效，所以不應該渲染任何內容
				const css = engine.renderAtomicRules()
				expect(css).toBe('')
			})
		})
	})
})
