import type { Properties, StyleItem } from '../detailed-types'
import type { Arrayable, Awaitable } from '../types'

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

export interface CorePluginConfig {
	important?: ImportantConfig
	variablesPrefix?: string
	variables?: VariableConfig[]
	keyframes?: KeyframesConfig[]
	selectors?: SelectorConfig[]
	shortcuts?: ShortcutConfig[]
}
