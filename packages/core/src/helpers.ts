import type { EngineConfig, ResolvedCommonConfig } from './config'
import type { EnginePlugin } from './engine'
import { addToSet } from './utils'

export function appendAutocompleteSelectors(config: ResolvedCommonConfig, ...selectors: string[]) {
	addToSet(config.autocomplete.selectors, ...selectors)
}

export function appendAutocompleteStyleItemStrings(config: ResolvedCommonConfig, ...styleItemStrings: string[]) {
	addToSet(config.autocomplete.styleItemStrings, ...styleItemStrings)
}

export function appendAutocompleteExtraProperties(config: ResolvedCommonConfig, ...properties: string[]) {
	addToSet(config.autocomplete.extraProperties, ...properties)
}

export function appendAutocompleteExtraCssProperties(config: ResolvedCommonConfig, ...properties: string[]) {
	addToSet(config.autocomplete.extraCssProperties, ...properties)
}

export function appendAutocompletePropertyValues(config: ResolvedCommonConfig, property: string, ...tsTypes: string[]) {
	const current = config.autocomplete.properties.get(property) || []
	config.autocomplete.properties.set(property, [...current, ...tsTypes])
}

export function appendAutocompleteCssPropertyValues(config: ResolvedCommonConfig, property: string, ...values: (string | number)[]) {
	const current = config.autocomplete.cssProperties.get(property) || []
	config.autocomplete.cssProperties.set(property, [...current, ...values])
}

export function defineEngineConfig(config: EngineConfig) {
	return config
}

export function defineEnginePlugin<Plugins extends EnginePlugin[]>(plugins: [...Plugins]): Plugins
export function defineEnginePlugin<Plugin extends EnginePlugin>(plugin: Plugin): Plugin
export function defineEnginePlugin(plugin: EnginePlugin | EnginePlugin[]) {
	return plugin
}
