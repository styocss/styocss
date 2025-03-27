import type { ResolvedEngineConfig } from '../src/engine/config'

import { resolvePlugins } from '../src/engine/plugin'

/**
 * 創建用於測試的標準 mock 配置
 */
export function createMockConfig(): ResolvedEngineConfig {
	return {
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
}

/**
 * 初始化並獲取插件實例
 * @param pluginFactory 插件工廠函數
 * @returns 初始化後的插件實例
 */
export function initAndGetPlugin<T extends Plugin>(pluginFactory: PluginFactory<T>): T {
	const pluginDef = pluginFactory()
	const plugins = resolvePlugins([pluginDef])
	const plugin = plugins[0] as T
	if (!plugin)
		throw new Error('Plugin initialization failed')
	return plugin
}

/**
 * 設置插件與配置
 * @param pluginFactory 插件工廠函數
 * @param config 配置對象
 * @returns 初始化後的插件及其配置
 */
export function setupPluginWithConfig<T extends Plugin>(
	pluginFactory: PluginFactory<T>,
	config: Record<string, any>,
) {
	const plugin = initAndGetPlugin(pluginFactory)
	plugin.beforeConfigResolving?.(config)
	const mockConfig = createMockConfig()
	plugin.configResolved?.(mockConfig)
	return { plugin, mockConfig }
}
