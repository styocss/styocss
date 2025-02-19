import type * as CSS from 'csstype'
import type { Arrayable } from './types'

type IsEqual<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false

type ToKebab<T extends string> = T extends `${infer A}${infer B}`
	? [A extends Uppercase<A> ? 1 : 0, A extends Lowercase<A> ? 1 : 0] extends [1, 0]
			? `-${Lowercase<A>}${ToKebab<`${B}`>}`
			: `${A}${ToKebab<`${B}`>}`
	: T

type FromKebab<T extends string> = T extends `--${string}`
	? T
	: T extends `-${infer A}${infer B}`
		? `${Uppercase<A>}${FromKebab<`${B}`>}`
		: T extends `${infer A}${infer B}`
			? `${A}${FromKebab<`${B}`>}`
			: T

type GetValue<
	Obj extends Record<string, any>,
	K extends string,
	// eslint-disable-next-line ts/no-empty-object-type
> = (IsEqual<Obj, object> | IsEqual<Obj, {}> | IsEqual<Obj[K], unknown>) extends false ? Obj[K] : never

interface Autocomplete {
	Selector: (string & {})
	StyleItemString: (string & {})
	ExtraProperty: (string & {})
	ExtraCssProperty: (string & {})
	PropertiesValue: Record<string, unknown>
	CssPropertiesValue: Record<string, (string & {}) | (number & {})>
}

interface EmptyAutocomplete extends Autocomplete {
	Selector: never
	StyleItemString: never
	ExtraProperty: never
	ExtraCssProperty: never
	PropertiesValue: never
	CssPropertiesValue: never
}

interface CSSVariables {
	[V: (`--${string}` & {})]: (string & {}) | (number & {})
}

interface CssProperties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}

type _PropertyValue<T> = T | [value: T, fallback: T[]] | null | undefined
export type Properties<
	ExtraProperty extends string = never,
	ExtraCssProperty extends string = never,
	PropertiesValue extends Record<string, unknown> = never,
	CssPropertiesValue extends Record<string, string | number> = never,
> = {
	[Key in keyof CssProperties | ExtraCssProperty | ExtraProperty]?: Key extends ExtraProperty
		? GetValue<PropertiesValue, Key>
		: _PropertyValue<Exclude<
				| (string & {})
				| (number & {})
				| GetValue<CssProperties, Key>
				| GetValue<CssPropertiesValue, ToKebab<Key>>
				| GetValue<CssPropertiesValue, FromKebab<Key>>
				| GetValue<CssPropertiesValue, '*'>,
				undefined | null
		>>
}

type WrapWithSelector<Autocomplete_ extends Autocomplete, T> = { [S in (string & {}) | Autocomplete_['Selector']]?: T | StyleItem<Autocomplete_>[] }

type StyleDefinition<
	Autocomplete_ extends Autocomplete,

	Depth_0 = Properties<Autocomplete_['ExtraProperty'], Autocomplete_['ExtraCssProperty'], Autocomplete_['PropertiesValue'], Autocomplete_['CssPropertiesValue']>,
	Depth_1 = WrapWithSelector<Autocomplete_, Depth_0>,
	Depth_2 = WrapWithSelector<Autocomplete_, Depth_1>,
	Depth_3 = WrapWithSelector<Autocomplete_, Depth_2>,
	Depth_4 = WrapWithSelector<Autocomplete_, Depth_3>,
> = Depth_0 | Depth_1 | Depth_2 | Depth_3 | Depth_4

export type StyleItem<
	Autocomplete_ extends Autocomplete = EmptyAutocomplete,
> =
	| (string & {})
	| Autocomplete_['StyleItemString']
	| StyleDefinition<Autocomplete_>

type StyleFnParams<Autocomplete_ extends Autocomplete> = (
	| StyleItem<Autocomplete_>
	| [selector: Arrayable<(string & {}) | Autocomplete_['Selector']>, ...StyleItem<Autocomplete_>[]]
)[]

export type StyleFn<Autocomplete_ extends Autocomplete = EmptyAutocomplete> = (...styleItems: StyleFnParams<Autocomplete_>) => Promise<string[]>
