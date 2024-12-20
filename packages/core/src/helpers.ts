import type { EngineConfig, ResolvedCommonConfig } from './config'
import type { EnginePlugin } from './engine'
import { corePlugins } from './plugins'
import type { Simplify } from './types'
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

export function defineEnginePlugin<Plugins extends EnginePlugin[]>(plugins: [...Plugins]): Plugins
export function defineEnginePlugin<Plugin extends EnginePlugin>(plugin: Plugin): Plugin
export function defineEnginePlugin(plugin: EnginePlugin | EnginePlugin[]) {
	return plugin
}

type MakeCustomConfigType<
	Plugins extends EnginePlugin[] = [],
	CustomConfig extends Record<string, any> = Record<string, any>,
> = Plugins extends [infer Plugin extends EnginePlugin, ...infer Rest extends EnginePlugin[]]
	? Plugin extends { customConfigType: Record<string, any> }
		? MakeCustomConfigType<Rest, Simplify<CustomConfig & Plugin['customConfigType']>>
		: MakeCustomConfigType<Rest, CustomConfig>
	: CustomConfig

interface EngineConfigBuilder<
	UsedPlugins extends EnginePlugin[] = [],
> {
	plugins: <Plugins extends EnginePlugin[]>(plugins: [...Plugins]) => EngineConfigBuilder<[...UsedPlugins, ...Plugins]>
	config: <Config extends EngineConfig & MakeCustomConfigType<UsedPlugins>>(config: Config) => Config
}

function _buildEngineConfig() {
	const plugins: EnginePlugin[] = []
	const builder: EngineConfigBuilder = {
		plugins: (_plugins) => {
			plugins.push(..._plugins)
			return builder
		},
		config: (_config) => {
			return {
				..._config,
				plugins: [...plugins, ..._config.plugins || []],
			}
		},
	}
	return builder
}

export function buildEngineConfig() {
	return _buildEngineConfig()
		.plugins(corePlugins())
}

export const defineEngineConfig: ReturnType<typeof buildEngineConfig>['config'] = (config) => {
	return buildEngineConfig().config(config)
}
