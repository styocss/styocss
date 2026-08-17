import { createFnConfig } from '@pikacss/integration'
import { describe, expect, it } from 'vitest'

import { buildFnNamePatterns, getCalleeName } from './fn-names'

describe('buildFnNamePatterns', () => {
	it('derives default base and member-access names from pika', () => {
		const patterns = buildFnNamePatterns()

		expect(patterns.fnName)
			.toBe('pika')
		expect([...patterns.allNames])
			.toEqual(['pika', 'pika.str', 'pika.arr'])
	})

	it('derives all variants from a custom base function name', () => {
		const patterns = buildFnNamePatterns('styled')

		expect(patterns.allNames)
			.toEqual(new Set([
				'styled',
				'styled.str',
				'styled.arr',
			]))
	})
})

describe('getCalleeName', () => {
	it('extracts simple identifiers and direct member expressions', () => {
		expect(getCalleeName({
			type: 'CallExpression',
			callee: { type: 'Identifier', name: 'pika' },
		}))
			.toBe('pika')

		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				computed: false,
				object: { type: 'Identifier', name: 'pika' },
				property: { type: 'Identifier', name: 'str' },
			},
		}))
			.toBe('pika.str')
	})

	it('extracts computed string and template-literal member access', () => {
		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				computed: true,
				object: { type: 'Identifier', name: 'pika' },
				property: { type: 'Literal', value: 'arr' },
			},
		}))
			.toBe('pika.arr')

		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				computed: true,
				object: { type: 'Identifier', name: 'pika' },
				property: {
					type: 'TemplateLiteral',
					quasis: [{ value: { cooked: 'str' } }],
					expressions: [],
				},
			},
		}))
			.toBe('pika.str')

		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				computed: true,
				object: { type: 'Identifier', name: 'pika' },
				property: {
					type: 'TemplateLiteral',
					quasis: [{ value: { cooked: null } }],
					expressions: [],
				},
			},
		}))
			.toBe('pika.')
	})

	it('unwraps TypeScript assertion wrappers and parentheses around callees', () => {
		// pika!(...)
		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'TSNonNullExpression',
				expression: { type: 'Identifier', name: 'pika' },
			},
		}))
			.toBe('pika')

		// (pika as X)(...)
		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'TSAsExpression',
				expression: { type: 'Identifier', name: 'pika' },
			},
		}))
			.toBe('pika')

		// (pika satisfies X)(...)
		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'TSSatisfiesExpression',
				expression: { type: 'Identifier', name: 'pika' },
			},
		}))
			.toBe('pika')

		// (<X>pika)(...), with an explicit ParenthesizedExpression node
		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'ParenthesizedExpression',
				expression: {
					type: 'TSTypeAssertion',
					expression: { type: 'Identifier', name: 'pika' },
				},
			},
		}))
			.toBe('pika')

		// (pika as X)!.str(...)
		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'TSNonNullExpression',
				expression: {
					type: 'MemberExpression',
					computed: false,
					object: {
						type: 'TSAsExpression',
						expression: { type: 'Identifier', name: 'pika' },
					},
					property: { type: 'Identifier', name: 'str' },
				},
			},
		}))
			.toBe('pika.str')
	})

	it('returns null for unsupported callee shapes', () => {
		expect(getCalleeName({
			type: 'CallExpression',
			callee: { type: 'CallExpression' },
		}))
			.toBeNull()

		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				computed: false,
				object: { type: 'Identifier', name: 'pika' },
				property: { type: 'Literal', value: 'str' },
			},
		}))
			.toBeNull()

		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				computed: true,
				object: { type: 'CallExpression' },
				property: { type: 'Literal', value: 'str' },
			},
		}))
			.toBeNull()

		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				computed: true,
				object: { type: 'Identifier', name: 'pika' },
				property: {
					type: 'TemplateLiteral',
					quasis: [{ value: { cooked: 'str' } }],
					expressions: [{}],
				},
			},
		}))
			.toBeNull()
	})
})

describe('consistency with @pikacss/integration createFnConfig', () => {
	// Both packages derive the pika() call-name variants independently (see the
	// cross-reference comments in fn-names.ts and the integration's
	// fnConfig.ts). This test fails when the derivations drift.
	it.each(['pika', 'css'])('agrees on the variant set derived from "%s"', (fnName) => {
		const fnConfig = createFnConfig(fnName)
		const patterns = buildFnNamePatterns(fnName)

		// The integration enumerates canonical dot-form names only (bracket
		// forms are normalized by its AST collector, exactly like this
		// package's getCalleeName).
		expect(new Set(fnConfig.variants.keys()))
			.toEqual(patterns.allNames)
	})
})
