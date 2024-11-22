import { toKebab } from './utils'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import type { AtomicStyleContent, StyleObj } from './types'
import type { ShortcutPartial } from './resolvers'

interface StyleObjExtractorOptions {
	defaultSelector: string
	resolveSelector: (selector: string) => string[] | undefined
	resolveShortcut: (shortcut: string) => ShortcutPartial[]
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

function normalizeValue(value: AtomicStyleContent['value']): AtomicStyleContent['value'] {
	if (Array.isArray(value))
		return [...new Set(value)]

	return value
}

function extract({
	styleObj,
	levels = [],
	result = [],
	resolveSelector,
	resolveShortcut,
	defaultSelector,
}: {
	styleObj: StyleObj
	levels?: string[]
	result?: AtomicStyleContent[]
	resolveSelector: (selector: string) => string[] | undefined
	resolveShortcut: (shortcut: string) => ShortcutPartial[]
	defaultSelector: string
}): AtomicStyleContent[] {
	// 1. Extract applied shortcuts
	const { $apply, ...rest } = styleObj
	const applied = ($apply == null ? [] : [$apply].flat(1)) as string[]
	const selector = normalizeSelectors({
		selectors: levels.flatMap(s => resolveSelector(s) || s),
		defaultSelector,
	})
	applied.forEach((shortcut) => {
		const resolved: StyleObj[] = resolveShortcut(shortcut)
		// Ignore unknown shortcuts
			.filter(partial => typeof partial !== 'string')

		resolved.forEach((s) => {
			result.push(
				...extract({
					styleObj: s,
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

	// 2. Extract rest properties
	Object.entries(rest)
		.forEach(([k, v]) => {
			if (typeof v === 'object' && v != null && Array.isArray(v) === false) {
				extract({
					styleObj: v as StyleObj,
					levels: [...levels, k],
					result,
					resolveSelector,
					resolveShortcut,
					defaultSelector,
				})
				return
			}

			const property = toKebab(k)
			const value = normalizeValue(v)

			result.push({
				selector,
				property,
				value,
			})
		})
	return result
}

export class StyleObjExtractor {
	private _options: StyleObjExtractorOptions

	constructor(options: StyleObjExtractorOptions) {
		this._options = options
	}

	extract(styleObj: StyleObj): AtomicStyleContent[] {
		return extract({
			styleObj,
			resolveSelector: this._options.resolveSelector,
			resolveShortcut: this._options.resolveShortcut,
			defaultSelector: this._options.defaultSelector,
		})
	}
}

export function createStyleObjExtractor(options: StyleObjExtractorOptions) {
	return new StyleObjExtractor(options)
}
