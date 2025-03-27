import type { ResolvedEngineConfig } from '../../../src/engine/config'
import type { _StyleDefinition } from '../../../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { important } from '../../../src/core-plugin/important'
import { resolvePlugins } from '../../../src/engine/plugin'
import { appendAutocompleteExtraProperties, appendAutocompletePropertyValues } from '../../../src/helpers'

// Mock helpers 函數
vi.mock('../../../src/helpers', () => ({
	appendAutocompleteExtraProperties: vi.fn(),
	appendAutocompletePropertyValues: vi.fn(),
}))

describe('core-plugin/important', () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	describe('important plugin', () => {
		it('應該創建具有正確名稱的插件', () => {
			const pluginDef = important()
			const plugins = resolvePlugins([pluginDef])
			expect(plugins[0]?.name).toBe('core:important')
		})

		describe('beforeConfigResolving 鉤子', () => {
			it('應該從配置中設置默認 important 值', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				const config = {
					important: {
						default: true,
					},
				}

				plugin.beforeConfigResolving(config)

				// 驗證 transformStyleDefinitions 會使用正確的 important 設定
				const testStyles = [{ color: 'red' } as _StyleDefinition]
				const transformResult = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(transformResult[0]).toEqual({
					color: ['red !important'],
				})
			})

			it('應該處理未定義的 config.important', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				const config = {}
				plugin.beforeConfigResolving(config)

				// 驗證 transformStyleDefinitions 使用的默認值為 false
				const testStyles = [{ color: 'red' } as _StyleDefinition]
				const transformResult = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(transformResult[0]).toEqual({ color: 'red' })
			})
		})

		describe('configResolved 鉤子', () => {
			it('應該添加自動完成屬性', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.configResolved) {
					throw new Error('插件初始化失敗')
				}

				const mockConfig = {} as ResolvedEngineConfig
				plugin.configResolved(mockConfig)

				expect(appendAutocompleteExtraProperties).toHaveBeenCalledWith(mockConfig, '__important')
				expect(appendAutocompletePropertyValues).toHaveBeenCalledWith(mockConfig, '__important', 'boolean')
			})
		})

		describe('transformStyleDefinitions 鉤子', () => {
			it('當 __important 為 true 時應該為屬性值添加 !important', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				plugin.beforeConfigResolving({ important: { default: false } })

				// 在 TypeScript 中，我們需要先建立一個合規的對象，然後使用類型斷言
				const testStyles = [{
					color: 'red',
					margin: ['10px', ['20px']],
				} as unknown as _StyleDefinition]

				// 強制設置 __important 屬性
				Object.defineProperty(testStyles[0], '__important', {
					value: true,
					enumerable: true,
				})

				const result = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(result[0]!.color).toEqual(['red !important'])
				expect(result[0]!.margin).toEqual(['10px !important', '20px !important'])
			})

			it('當 __important 未指定時應尊重全局默認值', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				plugin.beforeConfigResolving({ important: { default: true } })

				const testStyles = [{ color: 'red' } as _StyleDefinition]
				const result = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(result[0]).toEqual({
					color: ['red !important'],
				})
			})

			it('當 __important 為 false 時不應添加 !important', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				plugin.beforeConfigResolving({ important: { default: true } })

				// 在 TypeScript 中，我們需要先建立一個合規的對象，然後使用類型斷言
				const testStyles = [{ color: 'red' } as _StyleDefinition]

				// 強制設置 __important 屬性
				Object.defineProperty(testStyles[0], '__important', {
					value: false,
					enumerable: true,
				})

				const result = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(result[0]).toEqual({
					color: 'red',
				})
			})

			it('應該正確處理嵌套樣式定義', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				plugin.beforeConfigResolving({ important: { default: false } })

				// 建立帶有嵌套樣式的測試對象
				const testStyles = [{
					'color': 'red',
					'&:hover': {
						color: 'blue',
					},
				} as _StyleDefinition]

				// 設置 __important 屬性
				Object.defineProperty(testStyles[0], '__important', {
					value: true,
					enumerable: true,
				})

				const result = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				// 僅處理非嵌套屬性，嵌套對象應保持不變
				expect(result[0]).toEqual({
					'color': ['red !important'],
					'&:hover': {
						color: 'blue',
					},
				})
			})

			it('應該處理 null 和 undefined 值', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				plugin.beforeConfigResolving({ important: { default: false } })

				// 建立帶有 null 和 undefined 值的測試對象
				const testStyles = [{
					color: null,
					margin: undefined,
				} as _StyleDefinition]

				// 設置 __important 屬性
				Object.defineProperty(testStyles[0], '__important', {
					value: true,
					enumerable: true,
				})

				const result = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(result[0]).toEqual({
					color: null,
					margin: undefined,
				})
			})

			it('應該處理特殊格式的陣列 [value, fallbacks]', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				plugin.beforeConfigResolving({ important: { default: false } })

				// 建立帶有特殊格式陣列的測試對象
				const testStyles = [{
					color: ['red', ['blue', 'green']],
				} as unknown as _StyleDefinition]

				// 設置 __important 屬性
				Object.defineProperty(testStyles[0], '__important', {
					value: true,
					enumerable: true,
				})

				const result = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(result[0]!.color).toEqual(['red !important', 'blue !important', 'green !important'])
			})

			it('應該處理數字型屬性值', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				plugin.beforeConfigResolving({ important: { default: false } })

				// 建立帶有數字值的測試對象
				const testStyles = [{
					zIndex: 100,
					opacity: 0.5,
				} as unknown as _StyleDefinition]

				// 設置 __important 屬性
				Object.defineProperty(testStyles[0], '__important', {
					value: true,
					enumerable: true,
				})

				const result = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(result[0]).toEqual({
					zIndex: ['100 !important'],
					opacity: ['0.5 !important'],
				})
			})

			it('應該處理多個樣式定義', () => {
				const pluginDef = important()
				const plugins = resolvePlugins([pluginDef])
				const plugin = plugins[0]
				if (!plugin || !plugin.beforeConfigResolving || !plugin.transformStyleDefinitions) {
					throw new Error('插件初始化失敗')
				}

				plugin.beforeConfigResolving({ important: { default: false } })

				// 建立多個測試樣式
				const testStyles = [
					{ color: 'red' } as _StyleDefinition,
					{ margin: '10px' } as _StyleDefinition,
					{ padding: '5px' } as _StyleDefinition,
				]

				// 設置 __important 屬性
				Object.defineProperty(testStyles[0], '__important', {
					value: true,
					enumerable: true,
				})

				Object.defineProperty(testStyles[1], '__important', {
					value: false,
					enumerable: true,
				})

				// 第三個樣式不設置 __important，使用默認值

				const result = plugin.transformStyleDefinitions(testStyles) as _StyleDefinition[]

				expect(result).toEqual([
					{
						color: ['red !important'],
					},
					{
						margin: '10px',
					},
					{
						padding: '5px',
					},
				])
			})
		})
	})
})
