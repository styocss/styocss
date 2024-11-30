import type * as CSS from 'csstype'

export type Arrayable<T> = T | T[]

type CSSPropertyValue<
	K extends keyof CSS.Properties,
	V = CSS.Properties[K],
> = V | Exclude<V, undefined | null>[] | undefined | null
type CSSProperties = { [K in keyof CSS.Properties]?: CSSPropertyValue<K> }
type CSSVariables = Record<`--${string}`, string>
interface WithApply<Shortcut extends string = string> {
	$apply?: Arrayable<Shortcut>
}
interface Properties<
	Shortcut extends string = string,
> extends CSSProperties, CSSVariables, WithApply<Shortcut> {}

export interface AtomicStyleContent {
	selector: string[]
	property: string
	value: string | string[] | null | undefined
}

export interface AddedAtomicStyle {
	name: string
	content: AtomicStyleContent
}

type _StyleObj<
	Selector extends string,
	Shortcut extends string,
	MaxDepth extends number = 5,
	Result extends any[] = [],
> = Result extends { length: MaxDepth }
	? (Result[number] | Properties<Shortcut>)
	: Result extends []
		? _StyleObj<Selector, Shortcut, MaxDepth, [Record<Selector, Properties<Shortcut>>]>
		: _StyleObj<Selector, Shortcut, MaxDepth, [Record<Selector, Result[0]>, ...Result]>

export type StyleObj<
	Selector extends string = string,
	Shortcut extends string = string,
> = _StyleObj<Selector, Shortcut>

export type StyleItem<
	Selector extends string = string,
	Shortcut extends string = string,
> =
	| (string & {}) | Shortcut
	| StyleObj<
		(string & {}) | Selector,
		(string & {}) | Shortcut
	>
