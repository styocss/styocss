import type { EngineConfig, Properties, ResolvedEngineConfig, StyleDefinition, StyleItem } from './types'
import type { Awaitable } from './util-types'

type DefineHooks<Hooks extends Record<string, [type: 'sync' | 'async', payload: any, returnValue?: any]>> = Hooks

type EngineHooksDefinition<
	_CustomConfig,
	_Properties,
	_StyleDefinition,
	_StyleItem,
> = DefineHooks<{
	config: ['async', EngineConfig<EnginePlugin[], _Properties, _StyleDefinition, _StyleItem> & _CustomConfig]
	beforeConfigResolving: ['sync', EngineConfig<EnginePlugin[], _Properties, _StyleDefinition, _StyleItem> & _CustomConfig, void]
	configResolved: ['async', ResolvedEngineConfig]
	transformSelectors: ['async', string[]]
	transformStyleItems: ['async', _StyleItem[]]
	transformStyleDefinitions: ['async', _StyleDefinition[]]
	atomicRuleAdded: ['sync', void]
}>

export async function execAsyncHook(plugins: any[], hook: string, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook] == null)
			continue

		const newPayload = await plugin[hook](payload)
		if (newPayload != null)
			payload = newPayload
	}
	return payload
}

export function execSyncHook(plugins: any[], hook: string, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook] == null)
			continue

		const newPayload = plugin[hook](payload)
		if (newPayload != null)
			payload = newPayload
	}
	return payload
}

type EngineHooks<
	_CustomConfig extends Record<string, any>,
	_Properties,
	_StyleDefinition,
	_StyleItem,
> = {
	[K in keyof EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>]: (
		plugins: EnginePlugin[],
		...params: EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1] extends void ? [] : [payload: EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1]]
	) => EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K] extends [any, any, any]
		? EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][0] extends 'async' ? Promise<EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][2]> : EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][2]
		: EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][0] extends 'async' ? Promise<EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1]> : EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1]
}

export const hooks: EngineHooks<Record<string, any>, Properties, StyleDefinition, StyleItem> = {
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

type EnginePluginHooksOptions<
	_CustomConfig,
	_Properties,
	_StyleDefinition,
	_StyleItem,
> = {
	[K in keyof EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>]?: EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][0] extends 'async'
		? (...params: EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1] extends void ? [] : [payload: EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1]]) => Awaitable<EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1] | void>
		: (...params: EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1] extends void ? [] : [payload: EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1]]) => EngineHooksDefinition<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>[K][1] | void
}

export interface EnginePlugin<
	_CustomConfig = any,
	_Properties = Properties,
	_StyleDefinition = StyleDefinition,
	_StyleItem = StyleItem,
> extends EnginePluginHooksOptions<_CustomConfig, _Properties, _StyleDefinition, _StyleItem> {
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
export function defineEnginePlugin<
	_CustomConfig extends Record<string, any>,
	_Properties = Properties,
	_StyleDefinition = StyleDefinition,
	_StyleItem = StyleItem,
>(plugin: EnginePlugin<_CustomConfig, _Properties, _StyleDefinition, _StyleItem>): EnginePlugin<_CustomConfig, _Properties, _StyleDefinition, _StyleItem> {
	return plugin
}
/* c8 ignore end */
