import { describe, expect, it, vi } from 'vitest'

import { RecursiveResolver, resolveRuleConfig } from './resolver'

class StringResolver extends RecursiveResolver<string> {}

describe('recursiveResolver', () => {
	it('caches resolved values and clears matching cache entries when rules are removed', async () => {
		const resolver = new StringResolver()

		resolver.addStaticRule({
			key: 'btn',
			string: 'btn',
			resolved: ['button'],
		})
		resolver.addDynamicRule({
			key: 'space',
			stringPattern: /^space-(\d+)$/,
			createResolved: async matched => [`gap-${matched[1]}`],
		})

		expect(await resolver.resolve('btn'))
			.toEqual(['button'])
		expect(await resolver.resolve('space-4'))
			.toEqual(['gap-4'])
		expect(resolver._resolvedResultsMap.has('btn'))
			.toBe(true)
		expect(resolver._resolvedResultsMap.has('space-4'))
			.toBe(true)

		expect(resolver.staticRules)
			.toEqual([{ key: 'btn', string: 'btn', resolved: ['button'] }])
		expect(resolver.dynamicRules)
			.toHaveLength(1)

		// resolve again to hit cache path
		expect(await resolver.resolve('btn'))
			.toEqual(['button'])

		resolver.removeStaticRule('btn')
		resolver.removeDynamicRule('space')

		expect(resolver._resolvedResultsMap.has('btn'))
			.toBe(false)
		expect(resolver._resolvedResultsMap.has('space-4'))
			.toBe(false)
	})

	it('invalidates cached results when a rule with the same key is re-registered', async () => {
		const resolver = new StringResolver()

		resolver.addStaticRule({ key: 'hover', string: 'hover', resolved: ['$:hover'] })
		expect(await resolver.resolve('hover'))
			.toEqual(['$:hover'])

		resolver.addStaticRule({ key: 'hover', string: 'hover', resolved: ['$:focus'] })
		expect(await resolver.resolve('hover'))
			.toEqual(['$:focus'])
	})

	it('invalidates recursively expanded results when an upstream rule changes', async () => {
		const resolver = new StringResolver()

		resolver.addStaticRule({ key: 'a', string: 'a', resolved: ['b'] })
		resolver.addStaticRule({ key: 'b', string: 'b', resolved: ['X'] })
		expect(await resolver.resolve('a'))
			.toEqual(['X'])

		resolver.removeStaticRule('b')
		resolver.addStaticRule({ key: 'b', string: 'b', resolved: ['Y'] })
		expect(await resolver.resolve('a'))
			.toEqual(['Y'])
	})

	it('returns the original string when it encounters circular references or resolver errors', async () => {
		const resolver = new StringResolver()

		resolver.addStaticRule({
			key: 'a',
			string: 'a',
			resolved: ['b'],
		})
		resolver.addStaticRule({
			key: 'b',
			string: 'b',
			resolved: ['a'],
		})
		resolver.addDynamicRule({
			key: 'broken',
			stringPattern: /^broken$/,
			createResolved: async () => {
				throw new Error('boom')
			},
		})

		expect(await resolver.resolve('a'))
			.toEqual(['a'])
		expect(await resolver.resolve('broken'))
			.toEqual(['broken'])

		resolver.removeStaticRule('missing')
		resolver.removeDynamicRule('missing')
		resolver._setResolvedResult('broken', ['fixed'])
		resolver._setResolvedResult('broken', ['updated'])

		expect(resolver._resolvedResultsMap.get('broken'))
			.toEqual({ value: ['updated'] })
	})

	it('caches "no rule matched" misses and invalidates them on rule mutations', async () => {
		const resolver = new StringResolver()
		resolver.addDynamicRule({
			key: 'space',
			stringPattern: /^space-(\d+)$/,
			createResolved: async matched => [`gap-${matched[1]}`],
		})
		const execSpy = vi.spyOn(resolver.dynamicRulesMap.get('space')!.stringPattern, 'exec')

		expect(await resolver.resolve('btn'))
			.toEqual(['btn'])
		expect(resolver._unmatchedStrings.has('btn'))
			.toBe(true)
		expect(execSpy)
			.toHaveBeenCalledTimes(1)

		// A repeat miss is O(1): no dynamic regex is re-executed.
		expect(await resolver.resolve('btn'))
			.toEqual(['btn'])
		expect(execSpy)
			.toHaveBeenCalledTimes(1)

		// A string unresolved before a rule is added resolves after.
		resolver.addStaticRule({ key: 'btn', string: 'btn', resolved: ['button'] })
		expect(resolver._unmatchedStrings.size)
			.toBe(0)
		expect(await resolver.resolve('btn'))
			.toEqual(['button'])

		// Rule removals also invalidate negative entries.
		expect(await resolver.resolve('other'))
			.toEqual(['other'])
		expect(resolver._unmatchedStrings.has('other'))
			.toBe(true)
		resolver.removeStaticRule('btn')
		expect(resolver._unmatchedStrings.has('other'))
			.toBe(false)

		expect(await resolver.resolve('another'))
			.toEqual(['another'])
		expect(resolver._unmatchedStrings.has('another'))
			.toBe(true)
		resolver.removeDynamicRule('space')
		expect(resolver._unmatchedStrings.has('another'))
			.toBe(false)
	})

	it('keeps the static string index consistent across add, remove, and key re-registration', async () => {
		const resolver = new StringResolver()

		// Two rules with different keys but the same match string: the first
		// registered rule wins, mirroring the previous linear-scan behavior.
		resolver.addStaticRule({ key: 'a', string: 'shared', resolved: ['A'] })
		resolver.addStaticRule({ key: 'b', string: 'shared', resolved: ['B'] })
		expect(await resolver.resolve('shared'))
			.toEqual(['A'])

		// Removing a non-winning rule keeps the winner.
		resolver.removeStaticRule('b')
		expect(await resolver.resolve('shared'))
			.toEqual(['A'])

		// Removing the winner falls back to the next rule with the same string.
		resolver.addStaticRule({ key: 'b', string: 'shared', resolved: ['B'] })
		resolver.removeStaticRule('a')
		expect(await resolver.resolve('shared'))
			.toEqual(['B'])

		// Removing the last rule for a string leaves it unresolved.
		resolver.removeStaticRule('b')
		expect(await resolver.resolve('shared'))
			.toEqual(['shared'])

		// Re-registering a key with a different string re-points both strings.
		resolver.addStaticRule({ key: 'x', string: 's1', resolved: ['S1'] })
		expect(await resolver.resolve('s1'))
			.toEqual(['S1'])
		resolver.addStaticRule({ key: 'x', string: 's2', resolved: ['S2'] })
		expect(await resolver.resolve('s1'))
			.toEqual(['s1'])
		expect(await resolver.resolve('s2'))
			.toEqual(['S2'])
	})

	it('does not cache unresolved dynamic rule results so they can be retried', async () => {
		const resolver = new StringResolver()
		let calls = 0
		const config = resolveRuleConfig<string>({
			pattern: /^icon-(.+)$/,
			inputType: '`icon-$' + '{string}`',
			resolve: (matched: RegExpMatchArray) => {
				calls++
				return calls === 1 ? undefined : `resolved-${matched[1]}`
			},
		})
		resolver.addDynamicRule((config as any).rule)

		// First attempt fails (value fn returns undefined): unresolved and uncached,
		// including the negative cache — the rule matched, so the miss is retryable.
		expect(await resolver.resolve('icon-a'))
			.toEqual(['icon-a'])
		expect(resolver._resolvedResultsMap.has('icon-a'))
			.toBe(false)
		expect(resolver._unmatchedStrings.has('icon-a'))
			.toBe(false)

		// Second attempt succeeds because the rule is re-invoked.
		expect(await resolver.resolve('icon-a'))
			.toEqual(['resolved-a'])
		expect(calls)
			.toBe(2)
	})
})

describe('resolveRuleConfig', () => {
	it('normalizes frozen static and dynamic object forms', async () => {
		expect(resolveRuleConfig<string>({ name: 'hover', value: '$:hover', description: 'Hover' }))
			.toEqual({
				type: 'static',
				rule: {
					key: 'hover',
					string: 'hover',
					resolved: ['$:hover'],
				},
				autocomplete: ['hover'],
			})

		const dynamic = resolveRuleConfig<string>({
			pattern: /^space-(\d+)$/g,
			inputType: '`space-$' + '{number}`',
			resolve: (matched: RegExpMatchArray) => `gap-${matched[1]}`,
			autocomplete: ['space-1'],
			description: 'Spacing',
		})
		expect(dynamic)
			.toMatchObject({
				type: 'dynamic',
				rule: { key: '^space-(\\d+)$' },
				autocomplete: ['space-1'],
			})
		expect((dynamic as any).rule.stringPattern.global)
			.toBe(false)
		expect(await (dynamic as any).rule.createResolved('space-2'.match(/^space-(\d+)$/)!))
			.toEqual(['gap-2'])
	})

	it('rejects legacy and malformed rule shapes', () => {
		expect(resolveRuleConfig<string>('plain'))
			.toBeUndefined()
		expect(resolveRuleConfig<string>(['hover', '$:hover']))
			.toBeUndefined()
		expect(resolveRuleConfig<string>({ selector: 'hover', value: '$:hover' }))
			.toBeUndefined()
		expect(resolveRuleConfig<string>({ pattern: /^x$/, resolve: () => 'x' }))
			.toBeUndefined()
		expect(resolveRuleConfig<string>(null))
			.toBeUndefined()
	})
})
