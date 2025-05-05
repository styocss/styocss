import type { Engine } from './engine'
import type { AtomicStyle, Awaitable, EngineConfig, ResolvedEngineConfig, ResolvedStyleDefinition, ResolvedStyleItem, StyleDefinition, StyleItem } from './types'
import { warn } from './utils'

type DefineHooks<Hooks extends Record<string, [type: 'sync' | 'async', payload: any, returnValue?: any]>> = Hooks

type EngineHooksDefinition = DefineHooks<{
	configureRawConfig: ['async', config: EngineConfig]
	rawConfigConfigured: ['sync', config: EngineConfig, void]
	configureResolvedConfig: ['async', resolvedConfig: ResolvedEngineConfig]
	configureEngine: ['async', engine: Engine]
	transformSelectors: ['async', selectors: string[]]
	transformStyleItems: ['async', styleItems: ResolvedStyleItem[]]
	transformStyleDefinitions: ['async', styleDefinitions: ResolvedStyleDefinition[]]
	preflightUpdated: ['sync', void]
	atomicStyleAdded: ['sync', AtomicStyle]
	autocompleteConfigUpdated: ['sync', void]
}>

type GetHooksNames<
	T extends 'sync' | 'async',
	K extends keyof EngineHooksDefinition = keyof EngineHooksDefinition,
> = K extends keyof EngineHooksDefinition ? EngineHooksDefinition[K][0] extends T ? K : never : never

type SynctHooksNames = GetHooksNames<'sync'>
type AsyncHooksNames = GetHooksNames<'async'>

export async function execAsyncHook(plugins: any[], hook: AsyncHooksNames, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook] == null)
			continue

		try {
			const newPayload = await plugin[hook](payload)
			if (newPayload != null)
				payload = newPayload
		}
		catch (error: any) {
			warn(`Plugin "${plugin.name}" failed to execute hook "${hook}": ${error.message}`, error)
		}
	}
	return payload
}

export function execSyncHook(plugins: any[], hook: SynctHooksNames, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook] == null)
			continue

		try {
			const newPayload = plugin[hook](payload)
			if (newPayload != null)
				payload = newPayload
		}
		catch (error: any) {
			warn(`Plugin "${plugin.name}" failed to execute hook "${hook}": ${error.message}`, error)
		}
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
	configureRawConfig: (plugins: EnginePlugin[], config: EngineConfig) =>
		execAsyncHook(plugins, 'configureRawConfig', config),
	rawConfigConfigured: (plugins: EnginePlugin[], config: EngineConfig) =>
		execSyncHook(plugins, 'rawConfigConfigured', config),
	configureResolvedConfig: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) =>
		execAsyncHook(plugins, 'configureResolvedConfig', resolvedConfig),
	configureEngine: (plugins: EnginePlugin[], engine: Engine) =>
		execAsyncHook(plugins, 'configureEngine', engine),
	transformSelectors: (plugins: EnginePlugin[], selectors: string[]) =>
		execAsyncHook(plugins, 'transformSelectors', selectors),
	transformStyleItems: (plugins: EnginePlugin[], styleItems: StyleItem[]) =>
		execAsyncHook(plugins, 'transformStyleItems', styleItems),
	transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: StyleDefinition[]) =>
		execAsyncHook(plugins, 'transformStyleDefinitions', styleDefinitions),
	preflightUpdated: (plugins: EnginePlugin[]) =>
		execSyncHook(plugins, 'preflightUpdated', void 0),
	atomicStyleAdded: (plugins: EnginePlugin[]) =>
		execSyncHook(plugins, 'atomicStyleAdded', void 0),
	autocompleteConfigUpdated: (plugins: EnginePlugin[]) =>
		execSyncHook(plugins, 'autocompleteConfigUpdated', void 0),
}

type EnginePluginHooksOptions = {
	[K in keyof EngineHooksDefinition]?: EngineHooksDefinition[K][0] extends 'async'
		? (...params: EngineHooksDefinition[K][1] extends void ? [] : [payload: EngineHooksDefinition[K][1]]) => Awaitable<EngineHooksDefinition[K][1] | void>
		: (...params: EngineHooksDefinition[K][1] extends void ? [] : [payload: EngineHooksDefinition[K][1]]) => EngineHooksDefinition[K][1] | void
}

export interface EnginePlugin extends EnginePluginHooksOptions {
	name: string
	order?: 'pre' | 'post'
}

const orderMap = new Map([
	[void 0, 1],
	['pre', 0],
	['post', 2],
])

export function resolvePlugins(plugins: EnginePlugin[]): EnginePlugin[] {
	return plugins.sort((a, b) => orderMap.get(a.order)! - orderMap.get(b.order)!)
}

// Only for type inference without runtime effect
/* c8 ignore start */
export function defineEnginePlugin(plugin: EnginePlugin): EnginePlugin {
	return plugin
}
/* c8 ignore end */
