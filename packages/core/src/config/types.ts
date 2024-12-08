import type { Engine } from '../engine'
import type { EnginePlugin } from '../plugin'
import type { DynamicSelectorRule, DynamicShortcutRule, StaticSelectorRule, StaticShortcutRule } from '../resolvers'
import type { Arrayable, Autocomplete, Awaitable, Properties, StyleItem } from '../types'

export type PreflightFn<Autocomplete_ extends Autocomplete = Autocomplete> = (engine: Engine<Autocomplete_>) => string

export type PreflightConfig<Autocomplete_ extends Autocomplete = Autocomplete> = string | PreflightFn<Autocomplete_>

export type ShortcutConfig<Autocomplete_ extends Autocomplete = Autocomplete, Shortcut extends string = string> =
	| Shortcut
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Arrayable<StyleItem<Autocomplete_>>, autocomplete?: Arrayable<Shortcut>]
	| [shortcut: Shortcut, value: Arrayable<StyleItem<Autocomplete_>>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Arrayable<StyleItem<Autocomplete_>>
		autocomplete?: Arrayable<Shortcut>
	}
	| {
		shortcut: Shortcut
		value: Arrayable<StyleItem<Autocomplete_>>
	}

export type ResolvedShortcutConfig =
	| {
		type: 'static'
		rule: StaticShortcutRule
		autocomplete: string[]
	}
	| {
		type: 'dynamic'
		rule: DynamicShortcutRule
		autocomplete: string[]
	}

export type SelectorConfig<Autocomplete_ extends Autocomplete = Autocomplete, Selector extends string = string> =
	| Selector
	| [selector: RegExp, value: (matched: RegExpMatchArray) => Arrayable<(string & {}) | Autocomplete_['Selector']>, autocomplete?: Arrayable<Selector>]
	| [selector: Selector, value: Arrayable<(string & {}) | Autocomplete_['Selector']>]
	| {
		selector: RegExp
		value: (matched: RegExpMatchArray) => Arrayable<(string & {}) | Autocomplete_['Selector']>
		autocomplete?: Arrayable<Selector>
	}
	| {
		selector: Selector
		value: Arrayable<(string & {}) | Autocomplete_['Selector']>
	}

export type ResolvedSelectorConfig =
	| {
		type: 'static'
		rule: StaticSelectorRule
		autocomplete: string[]
	}
	| {
		type: 'dynamic'
		rule: DynamicSelectorRule
		autocomplete: string[]
	}

export interface AutocompleteConfig {
	selectors?: string[]
	shortcuts?: string[]
	extraProperties?: string[]
	properties?: Record<string, string[]>
}

export interface ResolvedAutocompleteConfig {
	selectors: Set<string>
	shortcuts: Set<string>
	extraProperties: Set<string>
	properties: Map<string, string[]>
}

export interface BasicEngineConfig<Autocomplete_ extends Autocomplete = Autocomplete> {
	/**
	 * Define styles that will be injected globally.
	 */
	preflights?: PreflightConfig<Autocomplete_>[]
	/**
	 * Define selectors.
	 */
	selectors?: SelectorConfig[]
	/**
	 * Define shortcuts.
	 */
	shortcuts?: ShortcutConfig[]
	/**
	 * Define variables.
	 */
	// variables?: VariableConfig<Autocomplete_>[]
	/**
	 * Define keyframes.
	 */
	// keyframes?: KeyframesConfig<Autocomplete_>[]

	autocomplete?: AutocompleteConfig

	/**
	 * Custom configuration.
	 */
	[K: string]: any
}

export interface EngineConfig<Autocomplete_ extends Autocomplete = Autocomplete> extends BasicEngineConfig<Autocomplete_> {
	/**
	 * Prefix for atomic style name.
	 *
	 * @default ''
	 */
	prefix?: string
	/**
	 * Default value for `$selector` property. (`'$'` will be replaced with the atomic style name.)
	 *
	 * @example '.$' - Usage in class attribute: `<div class="a b c">`
	 * @example '[data-styo="$"]' - Usage in attribute selector: `<div data-styo="a b c">`
	 * @default '.$'
	 */
	defaultSelector?: string

	plugins?: Awaitable<Arrayable<EnginePlugin<Autocomplete_>>>[]
}

export interface ResolvedCommonConfig<Autocomplete_ extends Autocomplete = Autocomplete> {
	selectors: ResolvedSelectorConfig[]
	shortcuts: ResolvedShortcutConfig[]
	// variables: ResolvedVariableConfig<Autocomplete_>[]
	// keyframes: ResolvedKeyframesConfig<Autocomplete_>[]
	preflights: PreflightFn<Autocomplete_>[]
	autocomplete: ResolvedAutocompleteConfig
}

export interface ResolvedEngineConfig<Autocomplete_ extends Autocomplete = Autocomplete> extends ResolvedCommonConfig<Autocomplete_> {
	rawConfig: EngineConfig<Autocomplete_>
	prefix: string
	defaultSelector: string
	plugins: EnginePlugin<Autocomplete_>[]
}
