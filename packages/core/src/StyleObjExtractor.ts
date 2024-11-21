import {
	isArray,
	toKebab,
} from './utils'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER,
	DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL,
} from './constants'
import type {
	AtomicStyleContent,
	StyleObj,
} from './types'

interface StyleObjExtractorOptions {
	defaultSelector: string
	resolveAliasForSelector: (alias: string) => string[] | undefined
}

function normalizeValue(value: AtomicStyleContent['value']): AtomicStyleContent['value'] {
	if (isArray(value))
		return [...new Set(value)]

	return value
}

const RE_SPLIT = /\s*,\s*/
class StyleObjExtractor {
	private _options: StyleObjExtractorOptions

	constructor(options: StyleObjExtractorOptions) {
		this._options = options
	}

	private _normalizeSelectors(selectors: string[]) {
		let normalizedSelectors: string[]
		const lastSelector = selectors[selectors.length - 1]
		if (selectors.length === 0) {
			normalizedSelectors = [DEFAULT_SELECTOR_PLACEHOLDER]
		}
		else if ([ATOMIC_STYLE_NAME_PLACEHOLDER, DEFAULT_SELECTOR_PLACEHOLDER].some(i => lastSelector!.includes(i))) {
			normalizedSelectors = selectors
		}
		else {
			normalizedSelectors = [...selectors, DEFAULT_SELECTOR_PLACEHOLDER]
		}

		return normalizedSelectors.map(s => s
			.replace(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL, this._options.defaultSelector)
			.split(RE_SPLIT)
			.join(','))
	}

	private _extract(styleObj: StyleObj, levels: string[] = [], result: AtomicStyleContent[] = []) {
		Object.entries(styleObj)
			.forEach(([key, _value]) => {
				if (typeof _value === 'object') {
					this._extract(_value as StyleObj, [...levels, key], result)
					return
				}

				const selector = this._normalizeSelectors(
					levels.flatMap(s => this._options.resolveAliasForSelector(s) || s),
				)
				const property = toKebab(key)
				const value = normalizeValue(_value)

				result.push({
					selector,
					property,
					value,
				})
			})
		return result
	}

	extract(styleObj: StyleObj): AtomicStyleContent[] {
		return this._extract(styleObj)
	}
}

export {
	StyleObjExtractor,
}
