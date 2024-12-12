export type Arrayable<T> = T | T[]

export type Awaitable<T> = T | Promise<T>

export interface Properties {
	[K: string]: Arrayable<string | number> | null | undefined
}

export interface StyleDefinition {
	[K: string]: Arrayable<string | number> | null | undefined | StyleDefinition
}

export type StyleItem = string | StyleDefinition

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
