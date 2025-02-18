import type { Engine, EnginePlugin } from '../engine'
import type { Arrayable } from '../types'
import type { ResolvedEnginePlugin } from './plugin'
import { ATOMIC_STYLE_NAME_PLACEHOLDER } from '../constants'
import { resolvePlugins } from '../engine'
import { appendAutocompleteCssPropertyValues, appendAutocompleteExtraCssProperties, appendAutocompleteExtraProperties, appendAutocompletePropertyValues, appendAutocompleteSelectors, appendAutocompleteStyleItemStrings } from '../helpers'

export type PreflightFn = (engine: Engine) => string

export type PreflightConfig = string | PreflightFn

export interface AutocompleteConfig {
	selectors?: string[]
	styleItemStrings?: string[]
	extraProperties?: string[]
	extraCssProperties?: string[]
	properties?: [property: string, tsType: Arrayable<string>][]
	cssProperties?: [property: string, value: Arrayable<string | number>][]
}

export interface ResolvedAutocompleteConfig {
	selectors: Set<string>
	styleItemStrings: Set<string>
	extraProperties: Set<string>
	extraCssProperties: Set<string>
	properties: Map<string, string[]>
	cssProperties: Map<string, (string | number)[]>
}

export interface EngineConfig<Plugins extends EnginePlugin[] = EnginePlugin[]> {
	plugins?: [...Plugins]
	/**
	 * Prefix for atomic style name.
	 *
	 * @default ''
	 */
	prefix?: string
	/**
	 * Default value for selector. (`'&'` will be replaced with the atomic style name.)
	 *
	 * @example '.&' - Usage in class attribute: `<div class="a b c">`
	 * @example '[data-styo~="&"]' - Usage in attribute selector: `<div data-styo="a b c">`
	 * @default '.&'
	 */
	defaultSelector?: string
	preflights?: PreflightConfig[]
	autocomplete?: AutocompleteConfig
	[K: string]: any
}

export interface ResolvedEngineConfig {
	rawConfig: EngineConfig
	prefix: string
	defaultSelector: string
	plugins: ResolvedEnginePlugin[]
	preflights: PreflightFn[]
	autocomplete: ResolvedAutocompleteConfig
}

export async function resolveEngineConfig(config: EngineConfig): Promise<ResolvedEngineConfig> {
	const {
		prefix = '',
		defaultSelector = `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
		plugins = [],
		preflights = [],
		autocomplete = {},
	} = config

	const resolvedConfig: ResolvedEngineConfig = {
		rawConfig: config,
		plugins: resolvePlugins(plugins),
		prefix,
		defaultSelector,
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

	// process preflights
	const resolvedPreflights = preflights.map<PreflightFn>(p => (typeof p === 'function' ? p : () => p))
	resolvedConfig.preflights.push(...resolvedPreflights)

	// process autocomplete
	appendAutocompleteSelectors(resolvedConfig, ...(autocomplete.selectors || []))
	appendAutocompleteStyleItemStrings(resolvedConfig, ...(autocomplete.styleItemStrings || []))
	appendAutocompleteExtraProperties(resolvedConfig, ...(autocomplete.extraProperties || []))
	appendAutocompleteExtraCssProperties(resolvedConfig, ...(autocomplete.extraCssProperties || []))
	autocomplete.properties?.forEach(([property, value]) => appendAutocompletePropertyValues(resolvedConfig, property, ...[value].flat()))
	autocomplete.cssProperties?.forEach(([property, value]) => appendAutocompleteCssPropertyValues(resolvedConfig, property, ...[value].flat()))

	return resolvedConfig
}
