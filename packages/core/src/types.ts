import type * as CSS from 'csstype'

export type Arrayable<T> = T | T[]

export type Awaitable<T> = T | Promise<T>

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

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type IsEqual<X, Y> =
	(<T>() => T extends X ? 1 : 2) extends
	(<T>() => T extends Y ? 1 : 2) ? true : false

export type ExcludeGeneralString<S extends string> = S extends any
	? IsEqual<S, string> extends true
		? never
		: IsEqual<S, (string & {})> extends true
			? never
			: S
	: never

type GetValue<
	Obj extends Record<string, any>,
	K extends string,
	// eslint-disable-next-line ts/no-empty-object-type
> = (IsEqual<Obj, object> | IsEqual<Obj, {}> | IsEqual<Obj[K], unknown>) extends false ? Obj[K] : never

export interface Autocomplete {
	Selector: (string & {})
	Shortcut: (string & {})
	ExtraProperties: (string & {})
	Properties: Record<string, (string & {})>
}

interface WithApply<Shortcut extends string> {
	$apply?: Arrayable<(string & {}) | Shortcut>
}

interface CSSVariables {
	[V: (`--${string}` & {})]: (string & {})
}

interface CSSProperties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}

export type Properties<
	ExtraProperties extends string,
	AutocompleteProperties extends Record<string, string>,
> = {
	[Key in keyof CSSProperties | ExtraProperties]?: Arrayable<
		Exclude<
			| (string & {})
			| GetValue<CSSProperties, Key>
			| GetValue<AutocompleteProperties, ToKebab<Key>>
			| GetValue<AutocompleteProperties, FromKebab<Key>>
			| GetValue<AutocompleteProperties, '*'>,
			undefined | null
		>
	> | undefined | null
}

type WrapWithSelector<Selector extends string, T> = { [S in Selector]?: T }

type _StyleDefinition<
	Shortcut extends string,
	Selector extends string,
	ExtraProperties extends string,
	AutocompleteProperties extends Record<string, string>,

	Depth_0 = WithApply<Shortcut> & Properties<ExtraProperties, AutocompleteProperties>,
	Depth_1 = WrapWithSelector<Selector, Depth_0>,
	Depth_2 = WrapWithSelector<Selector, Depth_1>,
	Depth_3 = WrapWithSelector<Selector, Depth_2>,
	Depth_4 = WrapWithSelector<Selector, Depth_3>,
> = Depth_0 | Depth_1 | Depth_2 | Depth_3 | Depth_4

type _StyleItem<
	Shortcut extends string,
	Selector extends string,
	ExtraProperties extends string,
	AutocompleteProperties extends Record<string, string>,
> = Shortcut | _StyleDefinition<Shortcut, Selector, ExtraProperties, AutocompleteProperties>

export type StyleDefinition = _StyleDefinition<never, never, never, never>

export type StyleItem<
	Autocomplete_ extends Autocomplete = Autocomplete,
> = _StyleItem<
	Autocomplete_['Shortcut'],
	Autocomplete_['Selector'],
	Autocomplete_['ExtraProperties'],
	Autocomplete_['Properties']
>

export interface ExtractedAtomicRuleContent {
	selector: string[]
	property: string
	value: string | string[] | null | undefined
}

export interface AtomicRuleContent {
	selector: string[]
	property: string
	value: string | string[]
}

export interface AtomicRule {
	name: string
	content: AtomicRuleContent
}
