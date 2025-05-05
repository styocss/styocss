import type * as CSS from 'csstype'
import type { FromKebab, GetValue, Nullish, ResolvedAutocomplete, ToKebab, UnionNumber, UnionString } from './internal/types'

export interface CSSVariables { [K: (`--${string}` & {})]: UnionString | UnionNumber }
export interface CSSProperties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}
export type CSSProperty = keyof CSSProperties
type MakePropertyValue<T> = T | [value: T, fallback: T[]] | Nullish
export type Properties = {
	[Key in keyof CSSProperties | ResolvedAutocomplete['ExtraCssProperty'] | ResolvedAutocomplete['ExtraProperty']]?: Key extends ResolvedAutocomplete['ExtraProperty']
		? GetValue<ResolvedAutocomplete['PropertiesValue'], Key>
		: MakePropertyValue<Exclude<
			| UnionString
			| UnionNumber
			| GetValue<CSSProperties, Key>
			| GetValue<ResolvedAutocomplete['CssPropertiesValue'], ToKebab<Key>>
			| GetValue<ResolvedAutocomplete['CssPropertiesValue'], FromKebab<Key>>
			| GetValue<ResolvedAutocomplete['CssPropertiesValue'], '*'>,
			Nullish
		>>
}

type CSSPseudos = `${'$'}${CSS.Pseudos}`
type CSSBlockAtRules = Exclude<CSS.AtRules, '@charset' | 'import' | '@namespace'>
export type CSSSelectors = CSSBlockAtRules | CSSPseudos
type WrapWithSelector<T> = { [S in UnionString | ResolvedAutocomplete['Selector'] | CSSSelectors]?: T | StyleItem[] }

type MakeStyleDefinition<MaxDepth extends number, Tuple extends any[] = []> = Tuple['length'] extends MaxDepth
	? Tuple[number]
	: Tuple['length'] extends 0
		? MakeStyleDefinition<MaxDepth, [Properties]>
		: MakeStyleDefinition<MaxDepth, [...Tuple, WrapWithSelector<[0, ...Tuple][Tuple['length']]>]>

export type StyleDefinition = MakeStyleDefinition<5>

export type StyleItem =
	| UnionString
	| ResolvedAutocomplete['StyleItemString']
	| StyleDefinition
