import type { _StyleDefinition, ExtractedAtomicRuleContent, PropertyValue } from '../types'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from '../constants'
import { isPropertyValue, toKebab } from '../utils'

const RE_SPLIT = /\s*,\s*/

function normalizeSelectors({
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

function normalizeValue(value: PropertyValue): ExtractedAtomicRuleContent['value'] {
	if (value == null)
		return value

	return [...new Set([value].flat().map(v => String(v).trim()))]
}

async function extract({
	styleDefinition,
	levels = [],
	result = [],
	defaultSelector,
	transformSelectors,
	transformStyleDefinitions,
}: {
	styleDefinition: _StyleDefinition
	levels?: string[]
	result?: ExtractedAtomicRuleContent[]
	defaultSelector: string
	transformSelectors: (selectors: string[]) => Promise<string[]>
	transformStyleDefinitions: (styleDefinitions: _StyleDefinition[]) => Promise<_StyleDefinition[]>
}): Promise<ExtractedAtomicRuleContent[]> {
	const selector = normalizeSelectors({
		selectors: await transformSelectors(levels),
		defaultSelector,
	})
	for (const definition of await transformStyleDefinitions([styleDefinition])) {
		for (const [k, v] of Object.entries(definition)) {
			if (isPropertyValue(v) === false) {
				await extract({
					styleDefinition: v,
					levels: [...levels, k],
					result,
					transformSelectors,
					transformStyleDefinitions,
					defaultSelector,
				})
			}
			else {
				const property = toKebab(k)
				const value = normalizeValue(v)

				result.push({
					selector,
					property,
					value,
				})
			}
		}
	}
	return result
}

export type ExtractFn = (styleDefinition: _StyleDefinition) => Promise<ExtractedAtomicRuleContent[]>

export function createExtractFn(options: {
	defaultSelector: string
	transformSelectors: (selectors: string[]) => Promise<string[]>
	transformStyleDefinitions: (styleDefinitions: _StyleDefinition[]) => Promise<_StyleDefinition[]>
}): ExtractFn {
	return (styleDefinition: _StyleDefinition) => extract({
		styleDefinition,
		...options,
	})
}
