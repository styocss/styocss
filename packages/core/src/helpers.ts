import type { EngineConfig, EnginePlugin, ResolvedBasicEngineConfig } from './engine'
import { important } from './plugins/important'
import { keyframes } from './plugins/keyframes'
import { selectors } from './plugins/selectors'
import { shortcuts } from './plugins/shortcuts'
import { variables } from './plugins/variables'
import type { Simplify } from './types'
import { addToSet } from './utils'

export function appendAutocompleteSelectors(config: ResolvedBasicEngineConfig, ...selectors: string[]) {
	addToSet(config.autocomplete.selectors, ...selectors)
}

export function appendAutocompleteStyleItemStrings(config: ResolvedBasicEngineConfig, ...styleItemStrings: string[]) {
	addToSet(config.autocomplete.styleItemStrings, ...styleItemStrings)
}

export function appendAutocompleteExtraProperties(config: ResolvedBasicEngineConfig, ...properties: string[]) {
	addToSet(config.autocomplete.extraProperties, ...properties)
}

export function appendAutocompleteExtraCssProperties(config: ResolvedBasicEngineConfig, ...properties: string[]) {
	addToSet(config.autocomplete.extraCssProperties, ...properties)
}

export function appendAutocompletePropertyValues(config: ResolvedBasicEngineConfig, property: string, ...tsTypes: string[]) {
	const current = config.autocomplete.properties.get(property) || []
	config.autocomplete.properties.set(property, [...current, ...tsTypes])
}

export function appendAutocompleteCssPropertyValues(config: ResolvedBasicEngineConfig, property: string, ...values: (string | number)[]) {
	const current = config.autocomplete.cssProperties.get(property) || []
	config.autocomplete.cssProperties.set(property, [...current, ...values])
}

type MakeCustomConfig<Plugins extends EnginePlugin[], Result extends Record<string, any> = Record<string, any>> = Plugins extends [infer Plugin extends EnginePlugin, ...infer Rest extends EnginePlugin[]]
	? MakeCustomConfig<Rest, Plugin extends EnginePlugin<infer PluginConfig> ? Simplify<Result & PluginConfig> : Result>
	: Result

interface EngineConfigBuilder<
	CustomConfig extends Record<string, any> = Record<string, any>,
> {
	plugin: <Plugin extends EnginePlugin>(plugin: Plugin) => EngineConfigBuilder<MakeCustomConfig<[Plugin], CustomConfig>>
	plugins: <Plugins extends EnginePlugin[]>(...plugins: [...Plugins]) => EngineConfigBuilder<MakeCustomConfig<Plugins, CustomConfig>>
	config: <Config extends EngineConfig & CustomConfig>(config: Config) => Config
}

function _buildEngineConfig() {
	const plugins: EnginePlugin[] = []
	const builder: EngineConfigBuilder = {
		plugin: (_plugin) => {
			plugins.push(_plugin as EnginePlugin)
			return builder
		},
		plugins: (..._plugins) => {
			plugins.push(..._plugins as EnginePlugin[])
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
		.plugins(
			variables(),
			important(),
			selectors(),
			shortcuts(),
			keyframes(),
		)
}

export const defineEngineConfig: ReturnType<typeof buildEngineConfig>['config'] = (config) => {
	return buildEngineConfig().config(config)
}
