import { ATOMIC_STYLE_NAME_PLACEHOLDER } from '../constants'
import { appendAutocompleteCssPropertyValues, appendAutocompleteExtraCssProperties, appendAutocompleteExtraProperties, appendAutocompletePropertyValues, appendAutocompleteSelectors, appendAutocompleteStyleItemStrings } from '../helpers'
import { resolvePlugins } from '../engine'
import type { BasicEngineConfig, EngineConfig, PreflightFn, ResolvedCommonConfig, ResolvedEngineConfig } from './types'

function resolveBasicEngineConfig(config: BasicEngineConfig): ResolvedCommonConfig {
	const resolvedConfig: ResolvedCommonConfig = {
		preflights: [],
		autocomplete: {
			selectors: new Set(),
			styleItemStrings: new Set(),
			extraProperties: new Set(),
			extraCssProperties: new Set(),
			properties: new Map(),
			cssProperties: new Map(),
		},
	}

	const {
		preflights = [],
		autocomplete = {},
	} = config

	const resolvedPreflights = preflights.map<PreflightFn>(p => (typeof p === 'function' ? p : () => p))
	resolvedConfig.preflights.push(...resolvedPreflights)

	appendAutocompleteSelectors(resolvedConfig, ...(autocomplete.selectors || []))
	appendAutocompleteStyleItemStrings(resolvedConfig, ...(autocomplete.styleItemStrings || []))
	appendAutocompleteExtraProperties(resolvedConfig, ...(autocomplete.extraProperties || []))
	appendAutocompleteExtraCssProperties(resolvedConfig, ...(autocomplete.extraCssProperties || []))
	autocomplete.properties?.forEach(([property, value]) => appendAutocompletePropertyValues(resolvedConfig, property, ...[value].flat()))
	autocomplete.cssProperties?.forEach(([property, value]) => appendAutocompleteCssPropertyValues(resolvedConfig, property, ...[value].flat()))

	return resolvedConfig
}

export async function resolveEngineConfig(config: EngineConfig): Promise<ResolvedEngineConfig> {
	const {
		prefix = '',
		defaultSelector = `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
		plugins = [],
		...commonConfig
	} = config

	const resolvedCommonConfig = resolveBasicEngineConfig(commonConfig)

	return {
		rawConfig: config,
		prefix,
		defaultSelector,
		plugins: await resolvePlugins(plugins),
		...resolvedCommonConfig,
	}
}
