import type { _StyleDefinition, _StyleItem, PropertyValue } from '../types'

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

export function isPropertyValue(v: PropertyValue | _StyleDefinition | _StyleItem[]): v is PropertyValue {
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

export function defineType<T>(_?: T) {
	return {} as T
}
