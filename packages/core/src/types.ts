import type * as CSS from 'csstype'
import type { Arrayable } from './internal/types'

export type {
	Arrayable,
	Awaitable,
	ExtractedAtomicRuleContent,
	AtomicRuleContent,
	AtomicRule,
} from './internal/types'

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type IsEqual<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false

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

export type ExcludeGeneralString<S extends string> = S extends any
	? [IsEqual<S, string>, IsEqual<S, (string & {})>] extends [false, false] ? S : never
	: never

type GetValue<
	Obj extends Record<string, any>,
	K extends string,
	// eslint-disable-next-line ts/no-empty-object-type
> = (IsEqual<Obj, object> | IsEqual<Obj, {}> | IsEqual<Obj[K], unknown>) extends false ? Obj[K] : never

export interface Autocomplete {
	Selectors: (string & {})
	ExtraProperties: (string & {})
	ExtraCSSProperties: (string & {})
	PropertiesValues: Record<string, (string & {})>
}

interface CSSVariables {
	[V: (`--${string}` & {})]: (string & {})
}

interface CSSProperties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}

export type Properties<
	ExtraProperties extends string = never,
	ExtraCSSProperties extends string = never,
	PropertiesValues extends Record<string, string> = never,
> = {
	[Key in keyof CSSProperties | ExtraCSSProperties | ExtraProperties]?: Arrayable<
		Exclude<
			| (string & {})
			| GetValue<CSSProperties, Key>
			| GetValue<PropertiesValues, ToKebab<Key>>
			| GetValue<PropertiesValues, FromKebab<Key>>
			| GetValue<PropertiesValues, FromKebab<Key>>
			| Key extends ExtraCSSProperties
				? GetValue<PropertiesValues, '*'>
				: never,
			undefined | null
		> & (string | number)
	> | undefined | null
}

type WrapWithSelector<Selector extends string, T> = { [S in Selector]?: T }

type _StyleDefinition<
	Selector extends string,
	ExtraProperties extends string,
	ExtraCSSProperties extends string,
	PropertiesValues extends Record<string, string>,

	Depth_0 = Properties<ExtraProperties, ExtraCSSProperties, PropertiesValues>,
	Depth_1 = WrapWithSelector<Selector, Depth_0>,
	Depth_2 = WrapWithSelector<Selector, Depth_1>,
	Depth_3 = WrapWithSelector<Selector, Depth_2>,
	Depth_4 = WrapWithSelector<Selector, Depth_3>,
> = Depth_0 | Depth_1 | Depth_2 | Depth_3 | Depth_4

type _StyleItem<
	Selector extends string,
	ExtraProperties extends string,
	ExtraCSSProperties extends string,
	PropertiesValues extends Record<string, string>,
> = (string & {}) | _StyleDefinition<Selector, ExtraProperties, ExtraCSSProperties, PropertiesValues>

export type StyleDefinition = _StyleDefinition<never, never, never, never>

export type StyleItem<
	Autocomplete_ extends Autocomplete = Autocomplete,
> = _StyleItem<
	Autocomplete_['Selectors'],
	Autocomplete_['ExtraProperties'],
	Autocomplete_['ExtraCSSProperties'],
	Autocomplete_['PropertiesValues']
>
