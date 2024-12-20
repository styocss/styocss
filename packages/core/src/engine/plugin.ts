import type { Arrayable, Awaitable, _StyleDefinition, _StyleItem } from '../types'
import type { EngineConfig, ResolvedEngineConfig } from '../config'

type DefineHooks<Hooks extends Record<string, [type: 'sync' | 'async', payload: any]>> = Hooks

type EngineHooksDefinition = DefineHooks<{
	config: ['async', EngineConfig]
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
		plugins: EnginePlugin[],
		...params: EngineHooksDefinition[K][1] extends void ? [] : [payload: EngineHooksDefinition[K][1]]
	) => EngineHooksDefinition[K][0] extends 'async' ? Promise<EngineHooksDefinition[K][1]> : EngineHooksDefinition
}

export const hooks: EngineHooks = {
	config: (plugins: EnginePlugin[], config: EngineConfig) =>
		execAsyncHook(plugins, 'config', config),
	configResolved: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) =>
		execAsyncHook(plugins, 'configResolved', resolvedConfig),
	transformSelectors: (plugins: EnginePlugin[], selectors: string[]) =>
		execAsyncHook(plugins, 'transformSelectors', selectors),
	transformStyleItems: (plugins: EnginePlugin[], styleItems: _StyleItem[]) =>
		execAsyncHook(plugins, 'transformStyleItems', styleItems),
	transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: _StyleDefinition[]) =>
		execAsyncHook(plugins, 'transformStyleDefinitions', styleDefinitions),
	atomicRuleAdded: (plugins: EnginePlugin[]) =>
		execSyncHook(plugins, 'atomicRuleAdded', undefined),
}

type EnginePluginHooksOptions = {
	[K in keyof EngineHooksDefinition]?: EngineHooksDefinition[K][0] extends 'async'
		? (...params: EngineHooksDefinition[K][1] extends void ? [] : [payload: EngineHooksDefinition[K][1]]) => Awaitable<EngineHooksDefinition[K][1] | void>
		: (...params: EngineHooksDefinition[K][1] extends void ? [] : [payload: EngineHooksDefinition[K][1]]) => EngineHooksDefinition[K][1] | void
}

export interface EnginePlugin extends EnginePluginHooksOptions {
	name: string
	enforce?: 'pre' | 'post'
	/**
	 * **Note:** This is a type only field and will not be used by the engine.
	 */
	customConfigType?: Record<string, any>
}

const orderMap = new Map([
	[undefined, 1],
	['pre', 0],
	['post', 2],
])
export async function resolvePlugins(plugins: Awaitable<Arrayable<EnginePlugin>>[]) {
	const result: EnginePlugin[] = []
	for (const plugin of plugins) {
		result.push(...[await plugin].flat())
	}

	return result.sort((a, b) => orderMap.get(a.enforce)! - orderMap.get(b.enforce)!)
}
