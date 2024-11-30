import type * as CSS from 'csstype'

export type Arrayable<T> = T | T[]

type CSSPropertyValue<
	K extends keyof CSS.Properties,
	Keyframes extends string = never,
	V = CSS.Properties[K] | (K extends 'animationName' | 'animation' ? Keyframes : never),
> = V | Exclude<V, undefined | null>[] | undefined | null
export type CSSProperties<Keyframes extends string = string> = { [K in keyof CSS.Properties]?: CSSPropertyValue<K, Keyframes> }
type CSSVariables = Record<`--${string}`, string>
interface WithApply<Shortcut extends string = never> {
	$apply?: [Shortcut] extends [never] ? undefined : Arrayable<Shortcut>
}

interface Properties<
	Shortcut extends string = never,
	Keyframes extends string = never,
> extends CSSProperties<Keyframes>, CSSVariables, WithApply<Shortcut> {}

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
	Keyframes extends string,
	MaxDepth extends number = 5,
	Result extends any[] = [],

	_Selector extends string = (string & {}) | Selector,
	_Shortcut extends string = (string & {}) | Shortcut,
> = Result extends { length: MaxDepth }
	? (Result[number] | Properties<_Shortcut, Keyframes>)
	: Result extends []
		? _StyleObj<_Selector, _Shortcut, Keyframes, MaxDepth, [Record<_Selector, Properties<_Shortcut, Keyframes>>]>
		: _StyleObj<_Selector, _Shortcut, Keyframes, MaxDepth, [Record<_Selector, Result[0]>, ...Result]>

export type StyleObj<
	Selector extends string = never,
	Shortcut extends string = never,
	Keyframes extends string = never,
> = _StyleObj<Selector, Shortcut, Keyframes>

export type StyleItem<
	Selector extends string = never,
	Shortcut extends string = never,
	Keyframes extends string = never,
> =
	| (string & {})
	| Shortcut
	| StyleObj<Selector, Shortcut, Keyframes>
