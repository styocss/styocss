import type { Nullish, ResolveFrom } from './utils'

export interface PikaAugment {}

export interface EngineExtraProperties {}

export type PropertyValue = string | number | [value: string | number, fallback: (string | number)[]] | Nullish

export type Properties = Record<string, PropertyValue>

export interface StyleDefinition {
	[K: string]: PropertyValue | StyleDefinition | StyleItem[]
}

export type StyleItem = string | StyleDefinition

export interface ExtractedAtomicStyleContent {
	selector: string[]
	property: string
	value: string[] | Nullish
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

export type ResolvedSelector = ResolveFrom<PikaAugment, 'Selector', string, string>
export type ResolvedCSSProperty = ResolveFrom<PikaAugment, 'CSSProperty', string, string>
export type ResolvedProperties = ResolveFrom<PikaAugment, 'Properties', any, Properties>
export type ResolvedStyleDefinition = ResolveFrom<PikaAugment, 'StyleDefinition', any, StyleDefinition>
export type ResolvedStyleItem = ResolveFrom<PikaAugment, 'StyleItem', any, StyleItem>
