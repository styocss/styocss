import type { StyleDefinition } from '../types'
import type { EngineConfig, ResolvedEngineConfig } from './config'
import type { Arrayable, Awaitable, StyleItem } from './types'

export interface EnginePlugin {
	name: string

	meta?: {
		configKey?: string
	}

	config?: (config: EngineConfig) => Awaitable<EngineConfig | void>

	configResolved?: (resolvedConfig: ResolvedEngineConfig) => Awaitable<ResolvedEngineConfig | void>

	transformSelectors?: (selectors: string[]) => (string[] | void)

	transformStyleItems?: (styleItems: StyleItem[]) => (StyleItem[] | void)

	transformStyleDefinitions?: (styleDefinitions: StyleDefinition[]) => (StyleDefinition[] | void)
}

export async function resolvePlugins(plugins: Awaitable<Arrayable<EnginePlugin>>[]) {
	const result: EnginePlugin[] = []
	for (const plugin of plugins) {
		result.push(...[await plugin].flat())
	}
	return result
}

type AsyncHookName = 'config' | 'configResolved'
type SyncHookName = 'transformSelectors' | 'transformStyleItems' | 'transformStyleDefinitions'

async function execAsyncHook(plugins: EnginePlugin[], hook: AsyncHookName, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook]) {
			const newPayload = await plugin[hook](payload)
			if (newPayload) {
				payload = newPayload
			}
		}
	}
	return payload
}
function execSyncHook(plugins: EnginePlugin[], hook: SyncHookName, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook]) {
			const newPayload = plugin[hook](payload)
			if (newPayload) {
				payload = newPayload
			}
		}
	}
	return payload
}

interface EnginePluginHooks {
	config: (plugins: EnginePlugin[], config: EngineConfig) => Promise<EngineConfig>
	configResolved: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) => Promise<ResolvedEngineConfig>
	transformSelectors: (plugins: EnginePlugin[], selectors: string[]) => string[]
	transformStyleItems: (plugins: EnginePlugin[], styleItems: StyleItem[]) => StyleItem[]
	transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: StyleDefinition[]) => StyleDefinition[]
}

export const pluginHooks: EnginePluginHooks = {
	config: (plugins: EnginePlugin[], config: EngineConfig) =>
		execAsyncHook(plugins, 'config', config),
	configResolved: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) =>
		execAsyncHook(plugins, 'configResolved', resolvedConfig),
	transformSelectors: (plugins: EnginePlugin[], selectors: string[]) =>
		execSyncHook(plugins, 'transformSelectors', selectors),
	transformStyleItems: (plugins: EnginePlugin[], styleItems: StyleItem[]) =>
		execSyncHook(plugins, 'transformStyleItems', styleItems),
	transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: StyleDefinition[]) =>
		execSyncHook(plugins, 'transformStyleDefinitions', styleDefinitions),
}

export function defineEnginePlugin(plugin: EnginePlugin) {
	return plugin
}
