import type { PikaAugment } from './shared'
import type { Arrayable, ResolveFrom, UnionNumber, UnionString } from './utils'

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

interface _Autocomplete {
	Selector: UnionString
	StyleItemString: UnionString
	ExtraProperty: UnionString
	ExtraCssProperty: UnionString
	PropertiesValue: Record<string, unknown>
	CssPropertiesValue: Record<string, UnionString | UnionNumber>
}

export type DefineAutocomplete<A extends _Autocomplete> = A

export type EmptyAutocomplete = DefineAutocomplete<{
	Selector: never
	StyleItemString: never
	ExtraProperty: never
	ExtraCssProperty: never
	PropertiesValue: never
	CssPropertiesValue: never
}>

export type ResolvedAutocomplete = ResolveFrom<PikaAugment, 'Autocomplete', _Autocomplete, EmptyAutocomplete>
