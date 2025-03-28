import type { Engine } from './engine'
import type { EnginePlugin } from './plugin'
import type { Properties, StyleItem } from './types'
import type { Arrayable, Awaitable } from './util-types'
import { ATOMIC_STYLE_NAME_PLACEHOLDER } from './constants'
import { resolvePlugins } from './plugin'
import {
	appendAutocompleteCssPropertyValues,
	appendAutocompleteExtraCssProperties,
	appendAutocompleteExtraProperties,
	appendAutocompletePropertyValues,
	appendAutocompleteSelectors,
	appendAutocompleteStyleItemStrings,
} from './utils'

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

export interface ImportantConfig {
	default?: boolean
}

export interface VariableAutocomplete {
	/**
	 * Specify the properties that the variable can be used as a value of.
	 *
	 * @default ['*']
	 */
	asValueOf?: Arrayable<string>
	/**
	 * Whether to add the variable as a CSS property.
	 *
	 * @default true
	 */
	asProperty?: boolean
}

export type VariableConfig =
	| string
	| [name: string, value?: string, autocomplete?: VariableAutocomplete]
	| { name: string, value?: string, autocomplete?: VariableAutocomplete }

export interface Frames {
	from: Properties
	to: Properties
	[K: `${number}%`]: Properties
}

export type KeyframesConfig =
	| string
	| [name: string, frames?: Frames, autocomplete?: string[]]
	| { name: string, frames?: Frames, autocomplete?: string[] }

export type SelectorConfig =
	| string
	| [selector: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<string>>, autocomplete?: Arrayable<string>]
	| [selector: string, value: Arrayable<string>]
	| {
		selector: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<string>>
		autocomplete?: Arrayable<string>
	}
	| {
		selector: string
		value: Arrayable<string>
	}

export type ShortcutConfig =
	| string
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<StyleItem>>, autocomplete?: Arrayable<string>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<StyleItem>>
		autocomplete?: Arrayable<string>
	}
	| [shortcut: string, value: Arrayable<StyleItem>]
	| {
		shortcut: string
		value: Arrayable<StyleItem>
	}

export interface EngineConfig {
	plugins?: EnginePlugin[]
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

	// Core Plugins Options
	important?: ImportantConfig
	variablesPrefix?: string
	variables?: VariableConfig[]
	keyframes?: KeyframesConfig[]
	selectors?: SelectorConfig[]
	shortcuts?: ShortcutConfig[]
	[K: string]: any
}

export interface ResolvedEngineConfig {
	rawConfig: EngineConfig
	prefix: string
	defaultSelector: string
	plugins: EnginePlugin[]
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
