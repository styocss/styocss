import type { StyleDefinition } from '../../../src/internal/types'
import { describe, expect, it } from 'vitest'
import {
	addToSet,
	isNotNullish,
	isNotString,
	isPropertyValue,
	isString,
	numberToChars,
	serialize,
	toKebab,
} from '../../../src/internal/utils'

describe('test utils/common', () => {
	describe('test numberToChars', () => {
		it('should convert number to alphabetic representation', () => {
			expect(numberToChars(0)).toBe('a')
			expect(numberToChars(1)).toBe('b')
			expect(numberToChars(25)).toBe('z')
			expect(numberToChars(26)).toBe('A')
			expect(numberToChars(51)).toBe('Z')
			expect(numberToChars(52)).toBe('aa')
			expect(numberToChars(103)).toBe('Za')
		})

		it('should handle large numbers uniquely', () => {
			const result1000 = numberToChars(1000)
			const result10000 = numberToChars(10000)

			// 確保結果是字串
			expect(typeof result1000).toBe('string')
			expect(typeof result10000).toBe('string')

			// 確保結果是唯一的
			expect(result1000).not.toBe(result10000)

			// 確保重複調用會得到相同結果
			expect(numberToChars(1000)).toBe(result1000)
			expect(numberToChars(10000)).toBe(result10000)
		})
	})

	describe('test toKebab', () => {
		it('should convert camelCase to kebab-case', () => {
			expect(toKebab('camelCase')).toBe('camel-case')
			expect(toKebab('ThisIsATest')).toBe('-this-is-a-test')
			expect(toKebab('ABC')).toBe('-a-b-c')
			expect(toKebab('already-kebab')).toBe('already-kebab')
		})

		it('should handle empty string', () => {
			expect(toKebab('')).toBe('')
		})
	})

	describe('test isNotNullish', () => {
		it('should return false for null and undefined', () => {
			expect(isNotNullish(null)).toBe(false)
			expect(isNotNullish(undefined)).toBe(false)
		})

		it('should return true for other values', () => {
			expect(isNotNullish(0)).toBe(true)
			expect(isNotNullish('')).toBe(true)
			expect(isNotNullish(false)).toBe(true)
			expect(isNotNullish({})).toBe(true)
			expect(isNotNullish([])).toBe(true)
		})
	})

	describe('test isString', () => {
		it('should return true for strings', () => {
			expect(isString('')).toBe(true)
			expect(isString('test')).toBe(true)
			expect(isString(String('test'))).toBe(true)
		})

		it('should return false for non-strings', () => {
			expect(isString(123)).toBe(false)
			expect(isString({})).toBe(false)
			expect(isString([])).toBe(false)
			expect(isString(null)).toBe(false)
			expect(isString(undefined)).toBe(false)
		})
	})

	describe('test isNotString', () => {
		it('should return false for strings', () => {
			expect(isNotString('')).toBe(false)
			expect(isNotString('test')).toBe(false)
			expect(isNotString(String('test'))).toBe(false)
		})

		it('should return true for non-strings', () => {
			expect(isNotString(123)).toBe(true)
			expect(isNotString({})).toBe(true)
			expect(isNotString([])).toBe(true)
			expect(isNotString(null)).toBe(true)
			expect(isNotString(undefined)).toBe(true)
		})
	})

	describe('test isPropertyValue', () => {
		it('should return true for valid property values', () => {
			expect(isPropertyValue('value')).toBe(true)
			expect(isPropertyValue(123)).toBe(true)
			expect(isPropertyValue(null)).toBe(true)
			expect(isPropertyValue(['value', ['fallback1', 'fallback2']])).toBe(true)
		})

		it('should return false for invalid property values', () => {
			const invalidStyleDef: StyleDefinition = { type: 'style', value: {} }
			expect(isPropertyValue(invalidStyleDef)).toBe(false)
			expect(isPropertyValue(['value', {}] as any)).toBe(false)
			expect(isPropertyValue(['value', ['fallback1', {}]] as any)).toBe(false)
		})
	})

	describe('test serialize', () => {
		it('should serialize primitive values', () => {
			expect(serialize('test')).toBe('"test"')
			expect(serialize(123)).toBe('123')
			expect(serialize(true)).toBe('true')
			expect(serialize(null)).toBe('null')
		})

		it('should serialize objects and arrays', () => {
			expect(serialize({ key: 'value' })).toBe('{"key":"value"}')
			expect(serialize(['a', 'b', 'c'])).toBe('["a","b","c"]')
		})
	})

	describe('test addToSet', () => {
		it('should add multiple values to a set', () => {
			const set = new Set<string>()
			addToSet(set, 'a', 'b', 'c')
			expect([...set]).toEqual(['a', 'b', 'c'])
		})

		it('should handle duplicate values', () => {
			const set = new Set<string>(['a'])
			addToSet(set, 'a', 'b', 'a')
			expect([...set]).toEqual(['a', 'b'])
		})

		it('should handle empty values array', () => {
			const set = new Set<string>(['a'])
			addToSet(set)
			expect([...set]).toEqual(['a'])
		})
	})
})
