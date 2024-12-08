import { toKebab } from './utils'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import type { ExtractedAtomicRuleContent, StyleDefinition, StyleItem } from './types'

interface StyleObjExtractorOptions {
	defaultSelector: string
	resolveSelector: (selector: string) => string[] | undefined
	resolveShortcut: (shortcut: string) => StyleItem[]
}

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
	resolveSelector,
	resolveShortcut,
	defaultSelector,
}: {
	styleDefinition: StyleDefinition
	levels?: string[]
	result?: ExtractedAtomicRuleContent[]
	resolveSelector: (selector: string) => string[] | undefined
	resolveShortcut: (shortcut: string) => StyleItem[]
	defaultSelector: string
}): ExtractedAtomicRuleContent[] {
	let definition = styleDefinition
	const selector = normalizeSelectors({
		selectors: levels.flatMap(s => resolveSelector(s) || s),
		defaultSelector,
	})
	// 1. Extract applied shortcuts
	if ('$apply' in styleDefinition) {
		const { $apply, ...rest } = styleDefinition
		const applied = ($apply == null ? [] : [$apply].flat(1)) as string[]
		applied.forEach((shortcut) => {
			const resolved: StyleDefinition[] = resolveShortcut(shortcut)
			// Ignore unknown shortcuts
				.filter(partial => typeof partial !== 'string')

			resolved.forEach((def) => {
				result.push(
					...extract({
						styleDefinition: def,
						resolveSelector,
						resolveShortcut,
						defaultSelector,
					}).map(content => ({
						...content,
						// Overwrite the selector
						selector,
					})),
				)
			})
		})
		definition = rest
	}

	// 2. Extract rest properties
	Object.entries(definition)
		.forEach(([k, v]) => {
			if (typeof v === 'object' && v != null && Array.isArray(v) === false) {
				extract({
					styleDefinition: v as StyleDefinition,
					levels: [...levels, k],
					result,
					resolveSelector,
					resolveShortcut,
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
	return result
}

export class StyleDefinitionExtractor {
	private _options: StyleObjExtractorOptions

	constructor(options: StyleObjExtractorOptions) {
		this._options = options
	}

	extract(styleDefinition: StyleDefinition): ExtractedAtomicRuleContent[] {
		return extract({
			styleDefinition,
			resolveSelector: this._options.resolveSelector,
			resolveShortcut: this._options.resolveShortcut,
			defaultSelector: this._options.defaultSelector,
		})
	}
}

export function createStyleDefinitionExtractor(options: StyleObjExtractorOptions) {
	return new StyleDefinitionExtractor(options)
}
