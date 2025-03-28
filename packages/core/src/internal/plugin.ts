import type { EngineConfig, ResolvedEngineConfig } from './config'
import type { StyleDefinition, StyleItem } from './types'
import type { Awaitable } from './util-types'

type DefineHooks<Hooks extends Record<string, [type: 'sync' | 'async', payload: any, returnValue?: any]>> = Hooks

type EngineHooksDefinition<CustomConfig extends Record<string, any> = Record<string, any>> = DefineHooks<{
	config: ['async', EngineConfig & CustomConfig]
	beforeConfigResolving: ['sync', EngineConfig & CustomConfig, void]
	configResolved: ['async', ResolvedEngineConfig]
	transformSelectors: ['async', string[]]
	transformStyleItems: ['async', StyleItem[]]
	transformStyleDefinitions: ['async', StyleDefinition[]]
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
		plugins: EnginePlugin[],
		...params: EngineHooksDefinition[K][1] extends void ? [] : [payload: EngineHooksDefinition[K][1]]
	) => EngineHooksDefinition[K] extends [any, any, any]
		? EngineHooksDefinition[K][0] extends 'async' ? Promise<EngineHooksDefinition[K][2]> : EngineHooksDefinition[K][2]
		: EngineHooksDefinition[K][0] extends 'async' ? Promise<EngineHooksDefinition[K][1]> : EngineHooksDefinition[K][1]
}

export const hooks: EngineHooks = {
	config: (plugins: EnginePlugin[], config: EngineConfig) =>
		execAsyncHook(plugins, 'config', config),
	beforeConfigResolving: (plugins: EnginePlugin[], config: EngineConfig) =>
		execSyncHook(plugins, 'beforeConfigResolving', config),
	configResolved: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) =>
		execAsyncHook(plugins, 'configResolved', resolvedConfig),
	transformSelectors: (plugins: EnginePlugin[], selectors: string[]) =>
		execAsyncHook(plugins, 'transformSelectors', selectors),
	transformStyleItems: (plugins: EnginePlugin[], styleItems: StyleItem[]) =>
		execAsyncHook(plugins, 'transformStyleItems', styleItems),
	transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: StyleDefinition[]) =>
		execAsyncHook(plugins, 'transformStyleDefinitions', styleDefinitions),
	atomicRuleAdded: (plugins: EnginePlugin[]) =>
		execSyncHook(plugins, 'atomicRuleAdded', undefined),
}

type EnginePluginHooksOptions<CustomConfig extends Record<string, any> = Record<string, any>> = {
	[K in keyof EngineHooksDefinition<CustomConfig>]?: EngineHooksDefinition<CustomConfig>[K][0] extends 'async'
		? (...params: EngineHooksDefinition<CustomConfig>[K][1] extends void ? [] : [payload: EngineHooksDefinition<CustomConfig>[K][1]]) => Awaitable<EngineHooksDefinition<CustomConfig>[K][1] | void>
		: (...params: EngineHooksDefinition<CustomConfig>[K][1] extends void ? [] : [payload: EngineHooksDefinition<CustomConfig>[K][1]]) => EngineHooksDefinition<CustomConfig>[K][1] | void
}

export interface EnginePlugin<CustomConfig extends Record<string, any> = Record<string, any>> extends EnginePluginHooksOptions<CustomConfig> {
	name: string
	order?: 'pre' | 'post'
}

const orderMap = new Map([
	[undefined, 1],
	['pre', 0],
	['post', 2],
])

export function resolvePlugins(plugins: EnginePlugin[]): EnginePlugin[] {
	return plugins.sort((a, b) => orderMap.get(a.order)! - orderMap.get(b.order)!)
}

// Only for type inference without runtime effect
/* c8 ignore start */
export function defineEnginePlugin<CustomConfig extends Record<string, any> = Record<string, any>>(plugin: EnginePlugin<CustomConfig>): EnginePlugin<CustomConfig> {
	return plugin
}
/* c8 ignore end */
