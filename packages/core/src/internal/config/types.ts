import type { Engine } from '../engine'
import type { EnginePlugin } from '../plugin'
import type { Arrayable, Awaitable } from '../types'

export type PreflightFn = (engine: Engine) => string

export type PreflightConfig = string | PreflightFn

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

export interface BasicEngineConfig {
	/**
	 * Define styles that will be injected globally.
	 */
	preflights?: PreflightConfig[]

	autocomplete?: AutocompleteConfig

	/**
	 * Custom configuration.
	 */
	[K: string]: any
}

export interface EngineConfig extends BasicEngineConfig {
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

	plugins?: Awaitable<Arrayable<EnginePlugin>>[]
}

export interface ResolvedCommonConfig {
	preflights: PreflightFn[]
	autocomplete: ResolvedAutocompleteConfig
}

export interface ResolvedEngineConfig extends ResolvedCommonConfig {
	rawConfig: EngineConfig
	prefix: string
	defaultSelector: string
	plugins: EnginePlugin[]
}
