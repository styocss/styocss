import type { Arrayable, Awaitable, _StyleDefinition, _StyleItem } from '../types'
import type { EngineConfig, ResolvedEngineConfig } from '../config'

interface EngineHooks {
	config: (plugins: EnginePlugin[], config: EngineConfig) => Promise<EngineConfig>
	configResolved: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) => Promise<ResolvedEngineConfig>
	transformSelectors: (plugins: EnginePlugin[], selectors: string[]) => Promise<string[]>
	transformStyleItems: (plugins: EnginePlugin[], styleItems: _StyleItem[]) => Promise<_StyleItem[]>
	transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: _StyleDefinition[]) => Promise<_StyleDefinition[]>
	atomicRuleAdded: (plugins: EnginePlugin[]) => void
}

async function execHook(plugins: any[], hook: string, payload: any) {
	for (const plugin of plugins) {
		if (plugin[hook] == null)
			continue

		const newPayload = await plugin[hook](payload)
		if (newPayload != null)
			payload = newPayload
	}
	return payload
}

export const hooks: EngineHooks = {
	config: (plugins: EnginePlugin[], config: EngineConfig) =>
		execHook(plugins, 'config', config),
	configResolved: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) =>
		execHook(plugins, 'configResolved', resolvedConfig),
	transformSelectors: (plugins: EnginePlugin[], selectors: string[]) =>
		execHook(plugins, 'transformSelectors', selectors),
	transformStyleItems: (plugins: EnginePlugin[], styleItems: _StyleItem[]) =>
		execHook(plugins, 'transformStyleItems', styleItems),
	transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: _StyleDefinition[]) =>
		execHook(plugins, 'transformStyleDefinitions', styleDefinitions),
	atomicRuleAdded: (plugins: EnginePlugin[]) =>
		execHook(plugins, 'atomicRuleAdded', undefined),
}

type EnginePluginHooksOptions = {
	[K in keyof EngineHooks]?: (
		...params: Parameters<EngineHooks[K]> extends [plugins: EnginePlugin[], payload: infer Payload, ...ignored: any[]]
			? [payload: Payload]
			: []
	) => Awaitable<Awaited<ReturnType<EngineHooks[K]>> | void>
}

export interface EnginePlugin extends EnginePluginHooksOptions {
	name: string
	enforce?: 'pre' | 'post'
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
