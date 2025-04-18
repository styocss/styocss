import type { ExtractedAtomicStyleContent, PropertyValue, StyleDefinition, StyleItem } from './types'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import { isPropertyValue, toKebab } from './utils'

const RE_SPLIT = /\s*,\s*/

export function normalizeSelectors({
	selectors,
	defaultSelector,
}: {
	selectors: string[]
	defaultSelector: string
}) {
	let normalized: string[]
	const lastSelector = selectors[selectors.length - 1]
	if (selectors.length === 0) {
		normalized = [DEFAULT_SELECTOR_PLACEHOLDER]
	}
	else if (
		lastSelector!.includes(ATOMIC_STYLE_NAME_PLACEHOLDER)
		|| lastSelector!.includes(DEFAULT_SELECTOR_PLACEHOLDER)
	) {
		normalized = selectors
	}
	else {
		normalized = [...selectors, DEFAULT_SELECTOR_PLACEHOLDER]
	}

	return normalized.map(s => s
		.replace(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL, defaultSelector)
		.split(RE_SPLIT)
		.join(','))
}

export function normalizeValue(value: PropertyValue): ExtractedAtomicStyleContent['value'] {
	if (value == null)
		return value

	return [...new Set([value].flat(2).map(v => String(v).trim()))]
}

export async function extract({
	styleDefinition,
	levels = [],
	result = [],
	defaultSelector,
	transformSelectors,
	transformStyleItems,
	transformStyleDefinitions,
}: {
	styleDefinition: StyleDefinition
	levels?: string[]
	result?: ExtractedAtomicStyleContent[]
	defaultSelector: string
	transformSelectors: (selectors: string[]) => Promise<string[]>
	transformStyleItems: (styleItems: StyleItem[]) => Promise<StyleItem[]>
	transformStyleDefinitions: (styleDefinitions: StyleDefinition[]) => Promise<StyleDefinition[]>
}): Promise<ExtractedAtomicStyleContent[]> {
	const selector = normalizeSelectors({
		selectors: await transformSelectors(levels),
		defaultSelector,
	})
	for (const definition of await transformStyleDefinitions([styleDefinition])) {
		for (const [k, v] of Object.entries(definition)) {
			if (isPropertyValue(v)) {
				const property = toKebab(k)
				const value = normalizeValue(v)

				result.push({
					selector,
					property,
					value,
				})
			}
			else if (Array.isArray(v)) {
				for (const styleItem of await transformStyleItems(v)) {
					if (typeof styleItem === 'string')
						continue

					await extract({
						styleDefinition: styleItem,
						levels: [...levels, k],
						result,
						transformSelectors,
						transformStyleItems,
						transformStyleDefinitions,
						defaultSelector,
					})
				}
			}
			else {
				await extract({
					styleDefinition: v,
					levels: [...levels, k],
					result,
					transformSelectors,
					transformStyleItems,
					transformStyleDefinitions,
					defaultSelector,
				})
			}
		}
	}
	return result
}

export type ExtractFn = (styleDefinition: StyleDefinition) => Promise<ExtractedAtomicStyleContent[]>

export function createExtractFn(options: {
	defaultSelector: string
	transformSelectors: (selectors: string[]) => Promise<string[]>
	transformStyleItems: (styleItems: StyleItem[]) => Promise<StyleItem[]>
	transformStyleDefinitions: (styleDefinitions: StyleDefinition[]) => Promise<StyleDefinition[]>
}): ExtractFn {
	return (styleDefinition: StyleDefinition) => extract({
		styleDefinition,
		...options,
	})
}
