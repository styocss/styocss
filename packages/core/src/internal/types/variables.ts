import type { Arrayable, UnionString } from './utils'

export interface VariableAutocomplete<_CSSProperty extends string = string> {
	/**
	 * Specify the properties that the variable can be used as a value of.
	 *
	 * @default ['*']
	 */
	asValueOf?: Arrayable<UnionString | '*' | _CSSProperty>
	/**
	 * Whether to add the variable as a CSS property.
	 *
	 * @default true
	 */
	asProperty?: boolean
}

export type VariableConfig<_CSSProperty extends string = string> =
	| string
	| [name: string, value?: string, autocomplete?: VariableAutocomplete<_CSSProperty>]
	| { name: string, value?: string, autocomplete?: VariableAutocomplete<_CSSProperty> }
