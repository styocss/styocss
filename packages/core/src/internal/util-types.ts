import type { EnginePlugin } from './plugin'

export type UnionString = string & {}

export type UnionNumber = number & {}

export type Arrayable<T> = T | T[]

export type Awaitable<T> = T | Promise<T>

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

export type IsEqual<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type ToKebab<T extends string> = T extends `${infer A}${infer B}`
	? [A extends Uppercase<A> ? 1 : 0, A extends Lowercase<A> ? 1 : 0] extends [1, 0]
			? `-${Lowercase<A>}${ToKebab<`${B}`>}`
			: `${A}${ToKebab<`${B}`>}`
	: T

export type FromKebab<T extends string> = T extends `--${string}`
	? T
	: T extends `-${infer A}${infer B}`
		? `${Uppercase<A>}${FromKebab<`${B}`>}`
		: T extends `${infer A}${infer B}`
			? `${A}${FromKebab<`${B}`>}`
			: T

export type GetValue<
	Obj extends Record<string, any>,
	K extends string,
	// eslint-disable-next-line ts/no-empty-object-type
> = (IsEqual<Obj, object> | IsEqual<Obj, {}> | IsEqual<Obj[K], unknown>) extends false ? Obj[K] : never

// eslint-disable-next-line ts/no-empty-object-type
export type PluginsCustomConfig<Plugins extends EnginePlugin[], Result extends Record<string, any> = {}> = Plugins extends [infer Plugin extends EnginePlugin, ...infer Rest extends EnginePlugin[]]
	? PluginsCustomConfig<Rest, Plugin extends EnginePlugin<infer PluginConfig> ? Simplify<Result & PluginConfig> : Result>
	: Result
