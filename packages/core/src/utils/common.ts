import type { PropertyValue, _StyleDefinition } from '../types'

const chars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ']
const numOfChars = chars.length
export function numberToChars(num: number) {
	let [str, n] = ['', num]
	while (true) {
		str = `${chars[n % numOfChars]}${str}`
		n = Math.floor(n / numOfChars)
		if (n === 0)
			break
	}
	return str
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

export function isPropertyValue(v: _StyleDefinition | PropertyValue): v is PropertyValue {
	if (typeof v === 'object' && v != null && Array.isArray(v) === false)
		return false
	return true
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
