import type { Engine } from './engine'
import type { EnginePlugin } from './plugin'
import type { Arrayable, Awaitable } from './util-types'

export type PropertyValue = string | number | [value: string | number, fallback: (string | number)[]] | null | undefined

export type Properties = Record<string, PropertyValue>

export interface StyleDefinition {
	[K: string]: PropertyValue | StyleDefinition | StyleItem[]
}

export type StyleItem = string | StyleDefinition

export interface ExtractedAtomicStyleContent {
	selector: string[]
	property: string
	value: string[] | null | undefined
}

export interface AtomicStyleContent {
	selector: string[]
	property: string
	value: string[]
}

export interface AtomicStyle {
	name: string
	content: AtomicStyleContent
}

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

export interface Frames<_Properties = Properties> {
	from: _Properties
	to: _Properties
	[K: `${number}%`]: _Properties
}

export type KeyframesConfig<_Properties = Properties> =
	| string
	| [name: string, frames?: Frames<_Properties>, autocomplete?: string[]]
	| { name: string, frames?: Frames<_Properties>, autocomplete?: string[] }

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

export type ShortcutConfig<_StyleItem = StyleItem> =
	| string
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<_StyleItem>>, autocomplete?: Arrayable<string>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<_StyleItem>>
		autocomplete?: Arrayable<string>
	}
	| [shortcut: string, value: Arrayable<_StyleItem>]
	| {
		shortcut: string
		value: Arrayable<_StyleItem>
	}

export interface EngineConfig<
	_Plugins extends EnginePlugin[] = EnginePlugin[],
	_Properties = Properties,
	_StyleDefinition = StyleDefinition,
	_StyleItem = StyleItem,
> {
	plugins?: [..._Plugins]
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
	keyframes?: KeyframesConfig<_Properties>[]
	selectors?: SelectorConfig[]
	shortcuts?: ShortcutConfig<_StyleItem>[]

	[key: string]: any
}

export interface ResolvedEngineConfig {
	rawConfig: EngineConfig
	prefix: string
	defaultSelector: string
	plugins: EnginePlugin[]
	preflights: PreflightFn[]
	autocomplete: ResolvedAutocompleteConfig
}
