import type { ExtractedAtomicStyleContent, PropertyValue, StyleDefinition, StyleItem } from './types'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL,
	DEFAULT_SELECTOR_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import { isPropertyValue, toKebab } from './utils'

const RE_SPLIT = /\s*,\s*/g

export function normalizeSelectors({
	selectors,
	defaultSelector,
}: {
	selectors: string[]
	defaultSelector: string
}) {
	if (selectors.length === 0)
		return [defaultSelector]

	const normalized = selectors.map(s => s.replace(RE_SPLIT, ','))
	const lastSelector = selectors[selectors.length - 1]
	if (
		lastSelector!.includes(ATOMIC_STYLE_NAME_PLACEHOLDER) === false
		&& lastSelector!.includes(DEFAULT_SELECTOR_PLACEHOLDER) === false
	) {
		normalized.push(defaultSelector)
	}

	return normalized.map(s => s
		.split(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL)
		.map(_ => _.replace(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL, defaultSelector))
		.join(ATOMIC_STYLE_NAME_PLACEHOLDER))
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
