import type { EngineConfig, EnginePlugin, ResolvedEngineConfig } from './engine'
import type { Simplify } from './types'
import { core, type CorePluginConfig } from './core-plugin'
import { addToSet } from './utils'

export function appendAutocompleteSelectors(config: Pick<ResolvedEngineConfig, 'autocomplete'>, ...selectors: string[]) {
	addToSet(config.autocomplete.selectors, ...selectors)
}

export function appendAutocompleteStyleItemStrings(config: Pick<ResolvedEngineConfig, 'autocomplete'>, ...styleItemStrings: string[]) {
	addToSet(config.autocomplete.styleItemStrings, ...styleItemStrings)
}

export function appendAutocompleteExtraProperties(config: Pick<ResolvedEngineConfig, 'autocomplete'>, ...properties: string[]) {
	addToSet(config.autocomplete.extraProperties, ...properties)
}

export function appendAutocompleteExtraCssProperties(config: Pick<ResolvedEngineConfig, 'autocomplete'>, ...properties: string[]) {
	addToSet(config.autocomplete.extraCssProperties, ...properties)
}

export function appendAutocompletePropertyValues(config: Pick<ResolvedEngineConfig, 'autocomplete'>, property: string, ...tsTypes: string[]) {
	const current = config.autocomplete.properties.get(property) || []
	config.autocomplete.properties.set(property, [...current, ...tsTypes])
}

export function appendAutocompleteCssPropertyValues(config: Pick<ResolvedEngineConfig, 'autocomplete'>, property: string, ...values: (string | number)[]) {
	const current = config.autocomplete.cssProperties.get(property) || []
	config.autocomplete.cssProperties.set(property, [...current, ...values])
}

type PluginsCustomConfig<Plugins extends EnginePlugin[], Result extends Record<string, any> = CorePluginConfig> = Plugins extends [infer Plugin extends EnginePlugin, ...infer Rest extends EnginePlugin[]]
	? PluginsCustomConfig<Rest, Plugin extends EnginePlugin<infer PluginConfig> ? Simplify<Result & PluginConfig> : Result>
	: Result

export function defineEngineConfig<Plugins extends EnginePlugin[]>(config: EngineConfig<Plugins> & PluginsCustomConfig<Plugins>): EngineConfig<Plugins> & PluginsCustomConfig<Plugins> {
	return {
		...config,
		plugins: [core(), ...(config.plugins || [])],
	}
}
