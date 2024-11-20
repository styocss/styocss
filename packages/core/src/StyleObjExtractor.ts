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
	defaultSelector: string[]
	resolveAliasForSelector: (alias: string) => string[] | undefined
}

function patchSelectorPlaceholder(selector: string) {
	return (selector.includes(ATOMIC_STYLE_NAME_PLACEHOLDER) || selector.includes(DEFAULT_SELECTOR_PLACEHOLDER))
		? selector
		: `${DEFAULT_SELECTOR_PLACEHOLDER}${selector}`
}

function normalizeValue(value: AtomicStyleContent['value']) {
	if (isArray(value))
		return [...new Set(value)]

	return value
}

const reSplitMaybeMultipleSelectors = /\s*,\s*/
function splitMaybeMultipleSelectors(selector: string) {
	return selector.split(reSplitMaybeMultipleSelectors)
}

class StyleObjExtractor {
	private _options: StyleObjExtractorOptions

	constructor(options: StyleObjExtractorOptions) {
		this._options = options
	}

	extract(styleObj: StyleObj): AtomicStyleContent[] {
		const {
			defaultNesting,
			defaultSelector,
			defaultImportant,
			resolveAliasForNesting,
			resolveAliasForSelector,
		} = this._options

		const {
			$nesting: nesting,
			$selector: selector,
			$important: important,
			...rawProperties
		} = styleObj

		const finalNesting: string[][] = nesting == null
			? defaultNesting
			: [nesting].flat(1).flatMap((maybeAlias) => {
					if (isArray(maybeAlias))
						return [maybeAlias]

					return resolveAliasForNesting(maybeAlias) || [[maybeAlias]]
				})
		const finalSelector = (
			selector == null
				? defaultSelector
				: [selector].flat(1).flatMap(maybeAlias => resolveAliasForSelector(maybeAlias) || maybeAlias)
		)
			.flatMap(splitMaybeMultipleSelectors)
			.flatMap(
				theSelector => defaultSelector
					.map(
						theDefaultSelector => patchSelectorPlaceholder(theSelector)
							.replace(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL, theDefaultSelector),
					),
			)

		const finalImportant = important != null ? important : defaultImportant

		const result: AtomicStyleContent[] = []

		if ((Object.keys(rawProperties).length === 0) && (result.length === 0))
			return []

		const propertyEntries = Object.entries(
			Object.fromEntries(
				Object.entries(rawProperties)
					.map(([property, value]) => [
						toKebab(property),
						normalizeValue(value as any),
					]),
			),
		)

		propertyEntries
			.forEach(([property, value]) => {
				if (finalNesting.length === 0) {
					finalSelector.forEach((theSelector) => {
						result.push({
							nesting: [],
							selector: theSelector,
							important: finalImportant,
							property,
							value,
						})
					})
					return
				}
				finalNesting.forEach((theNesting) => {
					finalSelector.forEach((theSelector) => {
						result.push({
							nesting: theNesting,
							selector: theSelector,
							important: finalImportant,
							property,
							value,
						})
					})
				})
			})

		return result
	}
}

export {
	StyleObjExtractor,
}
