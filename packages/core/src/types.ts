export type Arrayable<T> = T | T[]

export type Awaitable<T> = T | Promise<T>

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

export type IsEqual<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type PropertyValue = Arrayable<string | number> | null | undefined

export interface _Properties {
	[K: string]: PropertyValue
}

export interface _StyleDefinition {
	[K: string]: PropertyValue | _StyleDefinition
}

export type _StyleItem = string | _StyleDefinition

export interface ExtractedAtomicRuleContent {
	selector: string[]
	property: string
	value: string[] | null | undefined
}

export interface AtomicRuleContent {
	selector: string[]
	property: string
	value: string[]
}

export interface AtomicRule {
	name: string
	content: AtomicRuleContent
}
