import type { CSSStyleBlocks, PropertyValue, ResolvedEngineConfig, StyleDefinition, StyleItem } from './types'

const chars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ']
const numOfChars = chars.length
export function numberToChars(num: number) {
	if (num < numOfChars)
		return chars[num]!

	let result = ''
	let n = num
	// Handle the case when num >= numOfChars
	while (n >= 0) {
		result += chars[n % numOfChars]
		n = Math.floor(n / numOfChars) - 1
	}
	return result
}

const UPPER_CASE = /[A-Z]/g
export function toKebab(str: string) {
	return str.replace(UPPER_CASE, c => `-${c.toLowerCase()}`)
}

export function isNotNullish<T>(value: T): value is NonNullable<T> {
	return value != null
}

export function isString(value: any): value is string {
	return typeof value === 'string'
}

export function isNotString<V>(value: V): value is Exclude<V, string> {
	return typeof value !== 'string'
}

export function isPropertyValue(v: PropertyValue | StyleDefinition | StyleItem[]): v is PropertyValue {
	if (Array.isArray(v))
		return v.length === 2 && isPropertyValue(v[0]) && Array.isArray(v[1]) && v[1].every(isPropertyValue)

	if (v == null)
		return true

	if (typeof v === 'string' || typeof v === 'number')
		return true

	return false
}

export function serialize(value: any) {
	return JSON.stringify(value)
}

export function addToSet<T>(set: Set<T>, ...values: T[]) {
	values.forEach(value => set.add(value))
}

export function appendAutocompleteSelectors(config: Pick<ResolvedEngineConfig, 'autocomplete'>, ...selectors: string[]) {
	addToSet(config.autocomplete.selectors, ...selectors)
}

export function appendAutocompleteStyleItemStrings(config: Pick<ResolvedEngineConfig, 'autocomplete'>, ...styleItemStrings: string[]) {
	addToSet(config.autocomplete.styleItemStrings, ...styleItemStrings)
}

export function appendAutocompleteExtraProperties(config: Pick<ResolvedEngineConfig, 'autocomplete'>, ...properties: string[]) {
	addToSet(config.autocomplete.extraProperties, ...properties)
}

export function appendAutocompleteExtraCssProperties(config: Pick<ResolvedEngineConfig, 'autocomplete'>, ...properties: string[]) {
	addToSet(config.autocomplete.extraCssProperties, ...properties)
}

export function appendAutocompletePropertyValues(config: Pick<ResolvedEngineConfig, 'autocomplete'>, property: string, ...tsTypes: string[]) {
	const current = config.autocomplete.properties.get(property) || []
	config.autocomplete.properties.set(property, [...current, ...tsTypes])
}

export function appendAutocompleteCssPropertyValues(config: Pick<ResolvedEngineConfig, 'autocomplete'>, property: string, ...values: (string | number)[]) {
	const current = config.autocomplete.cssProperties.get(property) || []
	config.autocomplete.cssProperties.set(property, [...current, ...values])
}

export function renderCSSStyleBlocks(blocks: CSSStyleBlocks, isFormatted: boolean, depth = 0) {
	const blockIndent = isFormatted ? '  '.repeat(depth) : ''
	const blockBodyIndent = isFormatted ? '  '.repeat(depth + 1) : ''
	const selectorEnd = isFormatted ? ' ' : ''
	const propertySpace = isFormatted ? ' ' : ''
	const lineEnd = isFormatted ? '\n' : ''
	const lines: string[] = []
	blocks.forEach(({ properties, children }, selector) => {
		if (properties.length === 0 && children == null)
			return

		lines.push(...[
			`${blockIndent}${selector}${selectorEnd}{`,
			...properties.map(({ property, value }) => `${blockBodyIndent}${property}:${propertySpace}${value};`),
			...children != null
				? [renderCSSStyleBlocks(children, isFormatted, depth + 1)]
				: [],
			`${blockIndent}}`,
		])
	})
	return lines.join(lineEnd)
}
