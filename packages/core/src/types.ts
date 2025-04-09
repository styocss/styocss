import type * as CSS from 'csstype'
import type { FromKebab, GetValue, ToKebab, UnionNumber, UnionString } from './internal/util-types'

export interface Autocomplete {
	Selector: UnionString
	StyleItemString: UnionString
	ExtraProperty: UnionString
	ExtraCssProperty: UnionString
	PropertiesValue: Record<string, unknown>
	CssPropertiesValue: Record<string, UnionString | UnionNumber>
}

export interface EmptyAutocomplete extends Autocomplete {
	Selector: never
	StyleItemString: never
	ExtraProperty: never
	ExtraCssProperty: never
	PropertiesValue: never
	CssPropertiesValue: never
}

interface CSSVariables { [K: (`--${string}` & {})]: UnionString | UnionNumber }

interface CssProperties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}

type MakePropertyValue<T> = T | [value: T, fallback: T[]] | null | undefined
export type Properties<
	Autocomplete_ extends Autocomplete = EmptyAutocomplete,
> = {
	[Key in keyof CssProperties | Autocomplete_['ExtraCssProperty'] | Autocomplete_['ExtraProperty']]?: Key extends Autocomplete_['ExtraProperty']
		? GetValue<Autocomplete_['PropertiesValue'], Key>
		: MakePropertyValue<Exclude<
			| UnionString
			| UnionNumber
			| GetValue<CssProperties, Key>
			| GetValue<Autocomplete_['CssPropertiesValue'], ToKebab<Key>>
			| GetValue<Autocomplete_['CssPropertiesValue'], FromKebab<Key>>
			| GetValue<Autocomplete_['CssPropertiesValue'], '*'>,
			undefined | null
		>>
}

type WrapWithSelector<Autocomplete_ extends Autocomplete, T> = { [S in UnionString | Autocomplete_['Selector']]?: T | StyleItem<Autocomplete_>[] }

type MakeStyleDefinition<
	Autocomplete_ extends Autocomplete,
	MaxDepth extends number,
	Tuple extends any[] = [],
> = Tuple['length'] extends MaxDepth
	? Tuple[number]
	: Tuple['length'] extends 0
		? MakeStyleDefinition<Autocomplete_, MaxDepth, [Properties<Autocomplete_>]>
		: MakeStyleDefinition<Autocomplete_, MaxDepth, [...Tuple, WrapWithSelector<Autocomplete_, [0, ...Tuple][Tuple['length']]>]>

export type StyleDefinition<Autocomplete_ extends Autocomplete = EmptyAutocomplete> = MakeStyleDefinition<Autocomplete_, 5>

export type StyleItem<
	Autocomplete_ extends Autocomplete = EmptyAutocomplete,
> =
	| UnionString
	| Autocomplete_['StyleItemString']
	| StyleDefinition<Autocomplete_>
