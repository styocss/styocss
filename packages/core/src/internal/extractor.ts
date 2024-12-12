import { toKebab } from './utils'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import type { ExtractedAtomicRuleContent, StyleDefinition } from './types'

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

function normalizeValue(value: ExtractedAtomicRuleContent['value']): ExtractedAtomicRuleContent['value'] {
	if (Array.isArray(value))
		return [...new Set(value)]

	return value
}

function extract({
	styleDefinition,
	levels = [],
	result = [],
	defaultSelector,
	transformSelectors,
	transformStyleDefinitions,
}: {
	styleDefinition: StyleDefinition
	levels?: string[]
	result?: ExtractedAtomicRuleContent[]
	defaultSelector: string
	transformSelectors: (selectors: string[]) => string[]
	transformStyleDefinitions: (styleDefinitions: StyleDefinition[]) => StyleDefinition[]
}): ExtractedAtomicRuleContent[] {
	const selector = normalizeSelectors({
		selectors: transformSelectors(levels),
		defaultSelector,
	})
	transformStyleDefinitions([styleDefinition])
		.forEach((definition) => {
			Object.entries(definition)
				.forEach(([k, v]) => {
					if (typeof v === 'object' && v != null && Array.isArray(v) === false) {
						extract({
							styleDefinition: v as StyleDefinition,
							levels: [...levels, k],
							result,
							transformSelectors,
							transformStyleDefinitions,
							defaultSelector,
						})
						return
					}

					const property = toKebab(k)
					const value = normalizeValue(v as any)

					result.push({
						selector,
						property,
						value,
					})
				})
		})
	return result
}

export type ExtractFn = (styleDefinition: StyleDefinition) => ExtractedAtomicRuleContent[]

export function createExtractFn(options: {
	defaultSelector: string
	transformSelectors: (selectors: string[]) => string[]
	transformStyleDefinitions: (styleDefinitions: StyleDefinition[]) => StyleDefinition[]
}): ExtractFn {
	return (styleDefinition: StyleDefinition) => extract({
		styleDefinition,
		...options,
	})
}
