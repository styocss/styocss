import { describe, expect, it } from 'vitest'
import { AbstractResolver } from '../../../src/utils/resolver'

// Create a concrete resolver class for testing
class TestResolver extends AbstractResolver<string> {
	// Expose private properties for testing purposes
	public getResolvedResult(key: string) {
		return this._resolvedResultsMap.get(key)
	}
}

describe('test utils/resolver', () => {
	describe('test abstractResolver', () => {
		describe('test static rules', () => {
			it('should add and get static rules', () => {
				const resolver = new TestResolver()
				const rule = {
					key: 'test',
					string: 'test-string',
					resolved: 'test-value',
				}

				resolver.addStaticRule(rule)

				expect(resolver.staticRules).toHaveLength(1)
				expect(resolver.staticRules[0]).toEqual(rule)
				expect(resolver.staticRulesMap.get('test')).toEqual(rule)
			})

			it('should remove static rules', () => {
				const resolver = new TestResolver()
				const rule = {
					key: 'test',
					string: 'test-string',
					resolved: 'test-value',
				}

				resolver.addStaticRule(rule)
				expect(resolver.staticRules).toHaveLength(1)

				resolver.removeStaticRule('test')
				expect(resolver.staticRules).toHaveLength(0)
				expect(resolver.staticRulesMap.get('test')).toBeUndefined()
			})

			it('should handle removing non-existent static rule', () => {
				const resolver = new TestResolver()
				resolver.removeStaticRule('non-existent')
				expect(resolver.staticRules).toHaveLength(0)
			})
		})

		describe('test dynamic rules', () => {
			it('should add and get dynamic rules', () => {
				const resolver = new TestResolver()
				const rule = {
					key: 'test',
					stringPattern: /test-pattern/,
					createResolved: (_matched: RegExpMatchArray) => 'test-value',
				}

				resolver.addDynamicRule(rule)

				expect(resolver.dynamicRules).toHaveLength(1)
				expect(resolver.dynamicRules[0]).toEqual(rule)
				expect(resolver.dynamicRulesMap.get('test')).toEqual(rule)
			})

			it('should remove dynamic rules', () => {
				const resolver = new TestResolver()
				const rule = {
					key: 'test',
					stringPattern: /test-pattern/,
					createResolved: (_matched: RegExpMatchArray) => 'test-value',
				}

				resolver.addDynamicRule(rule)
				expect(resolver.dynamicRules).toHaveLength(1)

				resolver.removeDynamicRule('test')
				expect(resolver.dynamicRules).toHaveLength(0)
				expect(resolver.dynamicRulesMap.get('test')).toBeUndefined()
			})

			it('should handle removing non-existent dynamic rule', () => {
				const resolver = new TestResolver()
				resolver.removeDynamicRule('non-existent')
				expect(resolver.dynamicRules).toHaveLength(0)
			})
		})

		describe('test resolve', () => {
			it('should resolve static rules', async () => {
				const resolver = new TestResolver()
				const rule = {
					key: 'test',
					string: 'test-string',
					resolved: 'test-value',
				}

				resolver.addStaticRule(rule)
				const result = await resolver._resolve('test-string')
				expect(result).toBeDefined()
				expect(result?.value).toBe('test-value')
			})

			it('should resolve dynamic rules', async () => {
				const resolver = new TestResolver()
				const rule = {
					key: 'test',
					stringPattern: /test-pattern-(\d+)/,
					createResolved: (matched: RegExpMatchArray) => `value-${matched[1]}`,
				}

				resolver.addDynamicRule(rule)
				const result = await resolver._resolve('test-pattern-123')
				expect(result).toBeDefined()
				expect(result?.value).toBe('value-123')
			})

			it('should return undefined for unmatched strings', async () => {
				const resolver = new TestResolver()
				const result = await resolver._resolve('unmatched-string')
				expect(result).toBeUndefined()
			})

			it('should cache resolved results', async () => {
				const resolver = new TestResolver()
				const rule = {
					key: 'test',
					stringPattern: /test-pattern/,
					createResolved: (_matched: RegExpMatchArray) => 'test-value',
				}

				resolver.addDynamicRule(rule)

				// First parse
				const result1 = await resolver._resolve('test-pattern')
				expect(result1?.value).toBe('test-value')

				// Modify the cached value
				resolver._setResolvedResult('test-pattern', 'modified-value')

				// Second parse should return the cached value
				const result2 = await resolver._resolve('test-pattern')
				expect(result2?.value).toBe('modified-value')
			})
		})

		describe('test setResolvedResult', () => {
			it('should set new resolved result', () => {
				const resolver = new TestResolver()
				resolver._setResolvedResult('test-string', 'test-value')
				expect(resolver.getResolvedResult('test-string')?.value).toBe('test-value')
			})

			it('should update existing resolved result', () => {
				const resolver = new TestResolver()
				resolver._setResolvedResult('test-string', 'test-value')
				resolver._setResolvedResult('test-string', 'new-value')
				expect(resolver.getResolvedResult('test-string')?.value).toBe('new-value')
			})
		})
	})
})
