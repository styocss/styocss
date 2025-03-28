import type { EngineConfig } from './internal/config'
import type { EnginePlugin } from './internal/plugin'
import type { Simplify } from './internal/util-types'

export { defineEnginePlugin } from './internal/plugin'

// eslint-disable-next-line ts/no-empty-object-type
type PluginsCustomConfig<Plugins extends EnginePlugin[], Result extends Record<string, any> = {}> = Plugins extends [infer Plugin extends EnginePlugin, ...infer Rest extends EnginePlugin[]]
	? PluginsCustomConfig<Rest, Plugin extends EnginePlugin<infer PluginConfig> ? Simplify<Result & PluginConfig> : Result>
	: Result

// Only for type inference without runtime effect
/* c8 ignore start */
export function defineEngineConfig<Plugins extends EnginePlugin[]>(config: EngineConfig & PluginsCustomConfig<Plugins>): EngineConfig & PluginsCustomConfig<Plugins> {
	return config
}
/* c8 ignore end */
