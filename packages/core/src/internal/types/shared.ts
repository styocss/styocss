export type PropertyValue = string | number | [value: string | number, fallback: (string | number)[]] | null | undefined

export type Properties = Record<string, PropertyValue>

export interface StyleDefinition {
	[K: string]: PropertyValue | StyleDefinition | StyleItem[]
}

export type StyleItem = string | StyleDefinition

export interface ExtractedAtomicStyleContent {
	selector: string[]
	property: string
	value: string[] | null | undefined
}

export interface AtomicStyleContent {
	selector: string[]
	property: string
	value: string[]
}

export interface AtomicStyle {
	id: string
	content: AtomicStyleContent
}

export interface CSSStyleBlockBody {
	properties: { property: string, value: string }[]
	children?: CSSStyleBlocks
}

export type CSSStyleBlocks = Map<string, CSSStyleBlockBody>
