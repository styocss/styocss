import type { ExtractedAtomicStyleContent, Nullish, PropertyValue, StyleDefinition, StyleItem } from './types'
import {
	ATOMIC_STYLE_ID_PLACEHOLDER,
	ATOMIC_STYLE_ID_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import { isPropertyValue, toKebab } from './utils'

function replaceBySplitAndJoin(
	str: string,
	split: RegExp,
	mapFn: ((a: string) => string) | Nullish,
	join: string,
) {
	let splitted = str.split(split)
	if (mapFn != null)
		splitted = splitted.map(mapFn)
	return splitted
		.join(join)
}

const RE_SPLIT = /\s*,\s*/g
const DEFAULT_SELECTOR_PLACEHOLDER = '$'
const DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL = /\$/g
const ATTRIBUTE_SUFFIX_MATCH = '$='
const ATTRIBUTE_SUFFIX_MATCH_RE_GLOBAL = /\$=/g
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
		lastSelector!.includes(ATOMIC_STYLE_ID_PLACEHOLDER) === false
		&& lastSelector!.includes(DEFAULT_SELECTOR_PLACEHOLDER) === false
	) {
		normalized.push(DEFAULT_SELECTOR_PLACEHOLDER)
	}

	return normalized.map(s =>
		replaceBySplitAndJoin(
			s,
			ATOMIC_STYLE_ID_PLACEHOLDER_RE_GLOBAL,
			a => replaceBySplitAndJoin(
				a,
				ATTRIBUTE_SUFFIX_MATCH_RE_GLOBAL,
				b => replaceBySplitAndJoin(
					b,
					DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
					null,
					defaultSelector,
				),
				ATTRIBUTE_SUFFIX_MATCH,
			),
			ATOMIC_STYLE_ID_PLACEHOLDER,
		),
	)
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
