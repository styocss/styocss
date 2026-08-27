import { createFnConfig } from '@pikacss/integration'
import { describe, expect, it } from 'vitest'

import { buildFnNamePatterns, getCalleeName } from './fn-names'

describe('buildFnNamePatterns', () => {
	it('derives only the default base name from pika', () => {
		const patterns = buildFnNamePatterns()

		expect(patterns.fnName)
			.toBe('pika')
		expect([...patterns.allNames])
			.toEqual(['pika'])
	})

	it('derives only the configured custom base function name', () => {
		const patterns = buildFnNamePatterns('styled')

		expect(patterns.allNames)
			.toEqual(new Set(['styled']))
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

		// (pika<T>)(...) — TSInstantiationExpression callee (#119): the
		// compiler's collector unwraps it, so the rule must too.
		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'TSInstantiationExpression',
				expression: { type: 'Identifier', name: 'pika' },
			},
		}))
			.toBe('pika')

		// ((pika<T>).str)(...) — instantiation under a member expression.
		expect(getCalleeName({
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				computed: false,
				object: {
					type: 'TSInstantiationExpression',
					expression: { type: 'Identifier', name: 'pika' },
				},
				property: { type: 'Identifier', name: 'str' },
			},
		}))
			.toBe('pika.str')

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
	it.each(['pika', 'css'])('agrees on the reserved base identity derived from %j', (fnName) => {
		const fnConfig = createFnConfig(fnName)
		const patterns = buildFnNamePatterns(fnName)

		expect(fnConfig.fnName)
			.toBe(patterns.fnName)
		expect(patterns.allNames)
			.toEqual(new Set([fnConfig.fnName]))
	})
})
