import { ATOMIC_STYLE_NAME_PLACEHOLDER } from '../constants'
import { resolvePlugins } from '../plugin'
import { addToSet } from '../utils'
import type { BasicEngineConfig, EngineConfig, PreflightFn, ResolvedCommonConfig, ResolvedEngineConfig } from './types'

function resolveBasicEngineConfig(config: BasicEngineConfig): ResolvedCommonConfig {
	const resolvedConfig: ResolvedCommonConfig = {
		preflights: [],
		autocomplete: {
			selectors: new Set(),
			shortcuts: new Set(),
			extraProperties: new Set(),
			properties: new Map(),
		},
	}

	const {
		preflights = [],
		autocomplete = {},
	} = config

	const resolvedPreflights = preflights.map<PreflightFn>(p => (typeof p === 'function' ? p : () => p))
	resolvedConfig.preflights.push(...resolvedPreflights)
	addToSet(resolvedConfig.autocomplete.extraProperties, ...(autocomplete.extraProperties || []))
	Object.entries(autocomplete).forEach(([property, value]) => appendAutocompletePropertyValues(resolvedConfig, property, ...[value].flat()))

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

export function appendAutocompleteExtraProperties(config: ResolvedCommonConfig, ...properties: string[]) {
	addToSet(config.autocomplete.extraProperties, ...properties)
}

export function appendAutocompletePropertyValues(config: ResolvedCommonConfig, property: string, ...values: string[]) {
	const current = config.autocomplete.properties.get(property) || []
	config.autocomplete.properties.set(property, [...current, ...values])
}

export function defineEngineConfig(config: EngineConfig) {
	return config
}

export type * from './types'
