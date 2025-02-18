import type { CorePluginConfig } from '../core-plugin'
import type { _StyleDefinition, _StyleItem, Awaitable } from '../types'
import type { EngineConfig, ResolvedEngineConfig } from './config'

type DefineHooks<Hooks extends Record<string, [type: 'sync' | 'async', payload: any, returnValue?: any]>> = Hooks

type EngineHooksDefinition<CustomConfig extends Record<string, any> = Record<string, any>> = DefineHooks<{
	config: ['async', EngineConfig & CorePluginConfig & CustomConfig]
	beforeConfigResolving: ['sync', EngineConfig & CorePluginConfig & CustomConfig, void]
	configResolved: ['async', ResolvedEngineConfig]
	transformSelectors: ['async', string[]]
	transformStyleItems: ['async', _StyleItem[]]
	transformStyleDefinitions: ['async', _StyleDefinition[]]
	atomicRuleAdded: ['sync', void]
}>

async function execAsyncHook(plugins: any[], hook: string, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook] == null)
			continue

		const newPayload = await plugin[hook](payload)
		if (newPayload != null)
			payload = newPayload
	}
	return payload
}

function execSyncHook(plugins: any[], hook: string, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook] == null)
			continue

		const newPayload = plugin[hook](payload)
		if (newPayload != null)
			payload = newPayload
	}
	return payload
}

type EngineHooks = {
	[K in keyof EngineHooksDefinition]: (
		plugins: ResolvedEnginePlugin[],
		...params: EngineHooksDefinition[K][1] extends void ? [] : [payload: EngineHooksDefinition[K][1]]
	) => EngineHooksDefinition[K] extends [any, any, any]
		? EngineHooksDefinition[K][0] extends 'async' ? Promise<EngineHooksDefinition[K][2]> : EngineHooksDefinition[K][2]
		: EngineHooksDefinition[K][0] extends 'async' ? Promise<EngineHooksDefinition[K][1]> : EngineHooksDefinition[K][1]
}

export const hooks: EngineHooks = {
	config: (plugins: ResolvedEnginePlugin[], config: EngineConfig) =>
		execAsyncHook(plugins, 'config', config),
	beforeConfigResolving: (plugins: ResolvedEnginePlugin[], config: EngineConfig) =>
		execSyncHook(plugins, 'beforeConfigResolving', config),
	configResolved: (plugins: ResolvedEnginePlugin[], resolvedConfig: ResolvedEngineConfig) =>
		execAsyncHook(plugins, 'configResolved', resolvedConfig),
	transformSelectors: (plugins: ResolvedEnginePlugin[], selectors: string[]) =>
		execAsyncHook(plugins, 'transformSelectors', selectors),
	transformStyleItems: (plugins: ResolvedEnginePlugin[], styleItems: _StyleItem[]) =>
		execAsyncHook(plugins, 'transformStyleItems', styleItems),
	transformStyleDefinitions: (plugins: ResolvedEnginePlugin[], styleDefinitions: _StyleDefinition[]) =>
		execAsyncHook(plugins, 'transformStyleDefinitions', styleDefinitions),
	atomicRuleAdded: (plugins: ResolvedEnginePlugin[]) =>
		execSyncHook(plugins, 'atomicRuleAdded', undefined),
}

type EnginePluginHooksOptions<CustomConfig extends Record<string, any> = Record<string, any>> = {
	[K in keyof EngineHooksDefinition<CustomConfig>]?: EngineHooksDefinition<CustomConfig>[K][0] extends 'async'
		? (...params: EngineHooksDefinition<CustomConfig>[K][1] extends void ? [] : [payload: EngineHooksDefinition<CustomConfig>[K][1]]) => Awaitable<EngineHooksDefinition<CustomConfig>[K][1] | void>
		: (...params: EngineHooksDefinition<CustomConfig>[K][1] extends void ? [] : [payload: EngineHooksDefinition<CustomConfig>[K][1]]) => EngineHooksDefinition<CustomConfig>[K][1] | void
}

export interface ResolvedEnginePlugin<CustomConfig extends Record<string, any> = Record<string, any>> extends EnginePluginHooksOptions<CustomConfig> {
	name: string
	order?: 'pre' | 'post'
}

export type EnginePlugin<CustomConfig extends Record<string, any> = Record<string, any>> = ResolvedEnginePlugin<CustomConfig> | EnginePlugin<CustomConfig>[]

const orderMap = new Map([
	[undefined, 1],
	['pre', 0],
	['post', 2],
])

function flattenPlugins(plugins: EnginePlugin[]): ResolvedEnginePlugin[] {
	const flattened: ResolvedEnginePlugin[] = []
	for (const plugin of plugins) {
		if (Array.isArray(plugin))
			flattened.push(...flattenPlugins(plugin))
		else
			flattened.push(plugin)
	}
	return flattened
}

export function resolvePlugins(plugins: EnginePlugin[]): ResolvedEnginePlugin[] {
	return flattenPlugins(plugins)
		.sort((a, b) => orderMap.get(a.order)! - orderMap.get(b.order)!)
}

export function defineEnginePlugin<CustomConfig extends Record<string, any> = Record<string, any>>(plugin: EnginePlugin<CustomConfig>): EnginePlugin<CustomConfig> {
	return plugin
}
