import type { Arrayable, Awaitable, _StyleDefinition, _StyleItem } from '../types'
import type { EngineConfig, ResolvedEngineConfig } from './config'

type DefineHooks<Hooks extends Record<string, [type: 'sync' | 'async', payload: any]>> = Hooks

type EngineHooksDefinition<CustomConfig extends Record<string, any> = Record<string, any>> = DefineHooks<{
	config: ['async', EngineConfig & CustomConfig]
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
	) => EngineHooksDefinition[K][0] extends 'async' ? Promise<EngineHooksDefinition[K][1]> : EngineHooksDefinition
}

export const hooks: EngineHooks = {
	config: (plugins: ResolvedEnginePlugin[], config: EngineConfig) =>
		execAsyncHook(plugins, 'config', config),
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
	enforce?: 'pre' | 'post'
}

export type EnginePlugin<CustomConfig extends Record<string, any> = Record<string, any>> = Arrayable<ResolvedEnginePlugin<CustomConfig>>

const orderMap = new Map([
	[undefined, 1],
	['pre', 0],
	['post', 2],
])

export function resolvePlugins(plugins: EnginePlugin[]): ResolvedEnginePlugin[] {
	return plugins
		.flat(1)
		.sort((a, b) => orderMap.get(a.enforce)! - orderMap.get(b.enforce)!)
}

export function defineEnginePlugin<
	CustomConfig extends Record<string, any> = Record<string, any>,
>(plugin: EnginePlugin<CustomConfig>) {
	return plugin
}
