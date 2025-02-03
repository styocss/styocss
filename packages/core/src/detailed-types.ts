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

export type Properties<
	ExtraProperty extends string = never,
	ExtraCssProperty extends string = never,
	PropertiesValue extends Record<string, unknown> = never,
	CssPropertiesValue extends Record<string, string | number> = never,
> = {
	[Key in keyof CssProperties | ExtraCssProperty | ExtraProperty]?: Key extends ExtraProperty
		? GetValue<PropertiesValue, Key>
		: Arrayable<Exclude<
				| (string & {})
				| (number & {})
				| GetValue<CssProperties, Key>
				| GetValue<CssPropertiesValue, ToKebab<Key>>
				| GetValue<CssPropertiesValue, FromKebab<Key>>
				| GetValue<CssPropertiesValue, '*'>,
				undefined | null
		>> | undefined | null
}

type WrapWithSelector<Selector extends string, T> = { [S in (string & {}) | Selector]?: T }

type StyleDefinition<
	Selector extends string,
	ExtraProperty extends string,
	ExtraCssProperty extends string,
	PropertiesValue extends Record<string, unknown>,
	CssPropertiesValue extends Record<string, string | number>,

	Depth_0 = Properties<ExtraProperty, ExtraCssProperty, PropertiesValue, CssPropertiesValue>,
	Depth_1 = WrapWithSelector<Selector, Depth_0>,
	Depth_2 = WrapWithSelector<Selector, Depth_1>,
	Depth_3 = WrapWithSelector<Selector, Depth_2>,
	Depth_4 = WrapWithSelector<Selector, Depth_3>,
> = Depth_0 | Depth_1 | Depth_2 | Depth_3 | Depth_4

export type StyleItem<
	Autocomplete_ extends Autocomplete = EmptyAutocomplete,
> =
	| (string & {})
	| Autocomplete_['StyleItemString']
	| StyleDefinition<
		Autocomplete_['Selector'],
		Autocomplete_['ExtraProperty'],
		Autocomplete_['ExtraCssProperty'],
		Autocomplete_['PropertiesValue'],
		Autocomplete_['CssPropertiesValue']
	>

export type StyleFn<Autocomplete_ extends Autocomplete = EmptyAutocomplete> = (...styleItems: StyleItem<Autocomplete_>[]) => Promise<string[]>
