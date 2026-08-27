/* eslint-disable no-template-curly-in-string */
import type { EvaluateContext } from './evaluate'
import * as t from '@babel/types'
import { describe, expect, it } from 'vitest'
import { PikaTransformError } from './errors'
import { evaluateCallArguments, evaluateStatic } from './evaluate'
import { parseJsExpression } from './parse'

const ctx: EvaluateContext = {
	id: '/repo/src/mod.ts',
}

function evaluate(source: string, overrides?: Partial<EvaluateContext>) {
	return evaluateStatic(parseJsExpression(source, 'ts'), { ...ctx, ...overrides })
}

describe('evaluateStatic', () => {
	it('evaluates primitive literals', () => {
		expect(evaluate('"red"'))
			.toBe('red')
		expect(evaluate('42'))
			.toBe(42)
		expect(evaluate('true'))
			.toBe(true)
		expect(evaluate('null'))
			.toBe(null)
	})

	it('evaluates global constants only when unshadowed', () => {
		expect(evaluate('undefined'))
			.toBe(undefined)
		expect(evaluate('NaN'))
			.toBeNaN()
		expect(evaluate('Infinity'))
			.toBe(Number.POSITIVE_INFINITY)
		expect(() => evaluate('undefined', { shadowedGlobals: new Set(['undefined']) }))
			.toThrow(PikaTransformError)
	})

	it('rejects inherited Object.prototype keys as identifiers', () => {
		// Regression: `name in GLOBAL_CONSTANTS` matched inherited keys, so
		// `pika(toString)` evaluated to Object.prototype.toString.
		expect(() => evaluate('toString'))
			.toThrow(PikaTransformError)
		expect(() => evaluate('toString'))
			.toThrow('identifier "toString" is not statically known')
		expect(() => evaluate('hasOwnProperty'))
			.toThrow('identifier "hasOwnProperty" is not statically known')
		// Real global constants keep evaluating.
		expect(evaluate('undefined'))
			.toBe(undefined)
	})

	it('rejects unknown identifiers with position info', () => {
		try {
			evaluate('theme')
			expect.unreachable()
		}
		catch (error: any) {
			expect(error)
				.toBeInstanceOf(PikaTransformError)
			expect(error.stage)
				.toBe('evaluate')
			expect(error.loc)
				.toEqual({ line: 1, column: 0 })
			expect(error.message)
				.toContain('identifier "theme" is not statically known')
			expect(error.message)
				.toContain('/repo/src/mod.ts')
		}
	})

	it('evaluates unary operators', () => {
		expect(evaluate('-1'))
			.toBe(-1)
		expect(evaluate('+"2"'))
			.toBe(2)
		expect(evaluate('!false'))
			.toBe(true)
		expect(evaluate('void 0'))
			.toBe(undefined)
		expect(() => evaluate('typeof 1'))
			.toThrow('unsupported unary operator "typeof"')
		expect(() => evaluate('typeof x'))
			.toThrow(PikaTransformError)
	})

	it('evaluates static template literals', () => {
		expect(evaluate('`a ${1} ${"b"} ${true}`'))
			.toBe('a 1 b true')
		expect(evaluate('`plain`'))
			.toBe('plain')
		expect(() => evaluate('`x ${theme}`'))
			.toThrow(PikaTransformError)
		expect(() => evaluate('`x ${{}}`'))
			.toThrow('template expression does not evaluate to a primitive')
	})

	it('evaluates object expressions with all key forms', () => {
		expect(evaluate('{ color: "red", "font-size": "1rem", 12: "x", ["computed" + "Key"]: 1 }'))
			.toEqual({ 'color': 'red', 'font-size': '1rem', '12': 'x', 'computedKey': 1 })
	})

	it('evaluates object spread of static objects', () => {
		expect(evaluate('{ a: 1, ...{ b: 2 }, c: 3 }'))
			.toEqual({ a: 1, b: 2, c: 3 })
		expect(() => evaluate('{ ...[1] }'))
			.toThrow('object spread of a non-object value')
		expect(() => evaluate('{ ...null }'))
			.toThrow('object spread of a non-object value')
	})

	it('rejects object methods and dynamic computed keys', () => {
		expect(() => evaluate('{ m() {} }'))
			.toThrow('object methods are not supported')
		expect(() => evaluate('{ [Symbol.iterator]: 1 }'))
			.toThrow(PikaTransformError)
		expect(() => evaluate('{ [{}]: 1 }'))
			.toThrow('computed object key does not evaluate to a string or number')
	})

	it('evaluates array expressions with spread and holes', () => {
		expect(evaluate('[1, "a", ...[2, 3], , 4]'))
			.toEqual([1, 'a', 2, 3, undefined, 4])
		expect(() => evaluate('[...{}]'))
			.toThrow('array spread of a non-array value')
	})

	it('evaluates conditional expressions on static tests', () => {
		expect(evaluate('true ? "a" : "b"'))
			.toBe('a')
		expect(evaluate('0 ? "a" : "b"'))
			.toBe('b')
		expect(() => evaluate('cond ? "a" : "b"'))
			.toThrow(PikaTransformError)
	})

	it('evaluates logical operators with short-circuiting', () => {
		expect(evaluate('"a" && "b"'))
			.toBe('b')
		expect(evaluate('false && theme'))
			.toBe(false)
		expect(evaluate('"" || "fallback"'))
			.toBe('fallback')
		expect(evaluate('"kept" || theme'))
			.toBe('kept')
		expect(evaluate('null ?? "default"'))
			.toBe('default')
		expect(evaluate('0 ?? theme'))
			.toBe(0)
	})

	it('evaluates supported binary operators', () => {
		expect(evaluate('"a" + "-b"'))
			.toBe('a-b')
		expect(evaluate('"x" + 1'))
			.toBe('x1')
		expect(evaluate('3 + 4'))
			.toBe(7)
		expect(evaluate('10 - 4'))
			.toBe(6)
		expect(evaluate('6 * 7'))
			.toBe(42)
		expect(evaluate('10 / 4'))
			.toBe(2.5)
		expect(evaluate('1 === 1'))
			.toBe(true)
		expect(evaluate('1 !== 1'))
			.toBe(false)
		expect(() => evaluate('true + 1'))
			.toThrow('"+" on non-string/non-number operands')
		expect(() => evaluate('1 % 2'))
			.toThrow('unsupported binary operator')
	})

	it('unwraps TS wrapper expressions', () => {
		expect(evaluate('"red" as const'))
			.toBe('red')
		expect(evaluate('("red")!'))
			.toBe('red')
		expect(evaluate('("red" satisfies string)'))
			.toBe('red')
	})

	it('rejects calls, member access, and other dynamic expressions', () => {
		expect(() => evaluate('getColor()'))
			.toThrow('unsupported expression of type CallExpression')
		expect(() => evaluate('theme.color'))
			.toThrow('unsupported expression of type MemberExpression')
		expect(() => evaluate('() => 1'))
			.toThrow(PikaTransformError)
	})

	// The parser cannot produce these shapes (they are parse errors or gated
	// behind unused plugins), but the evaluator must still reject them cleanly
	// when handed such nodes (e.g. by a future processor).
	describe('constructed AST nodes', () => {
		it('rejects a template quasi without a cooked value', () => {
			const node = t.templateLiteral(
				[t.templateElement({ raw: '\\unicode' }, true)],
				[],
			)
			expect(() => evaluateStatic(node, ctx))
				.toThrow('template literal contains an invalid escape sequence')
		})

		it('rejects a binary expression with a PrivateName operand', () => {
			const node = t.binaryExpression('in', t.privateName(t.identifier('p')), t.objectExpression([]))
			expect(() => evaluateStatic(node, ctx))
				.toThrow('private names are not supported')
		})

		it('rejects an unknown logical operator', () => {
			const node = t.logicalExpression('&&', t.booleanLiteral(true), t.booleanLiteral(true))
			;(node as any).operator = '__unknown__'
			expect(() => evaluateStatic(node, ctx))
				.toThrow('unsupported logical operator')
		})

		it('reports without a position when the node has no loc', () => {
			try {
				evaluateStatic(t.identifier('theme'), ctx)
				expect.unreachable()
			}
			catch (error: any) {
				expect(error)
					.toBeInstanceOf(PikaTransformError)
				expect(error.loc)
					.toBeNull()
				expect(error.message)
					.toContain('(/repo/src/mod.ts)')
			}
		})
	})
})

describe('evaluateCallArguments', () => {
	it('expands static call spreads and rejects non-array spread values at evaluation time', () => {
		expect(evaluateCallArguments([
			t.spreadElement(t.arrayExpression([t.stringLiteral('a'), t.stringLiteral('b')])),
			t.stringLiteral('c'),
		], ctx))
			.toEqual(['a', 'b', 'c'])
		expect(() => evaluateCallArguments([
			t.spreadElement(t.objectExpression([])),
		], ctx))
			.toThrow('call spread of a non-array value')
	})
})

describe('pika static-extension evaluation (#146)', () => {
	function staticContext(entries: Record<string, unknown>) {
		const roots = new Map(Object.entries(entries))
		return {
			fnName: 'pika',
			hasStatic: (name: string) => roots.has(name),
			getStatic: (name: string) => roots.get(name),
		}
	}

	it('traverses dot/bracket members and transparent wrappers with ordinary synchronous property access', () => {
		class ThemeRoot {
			get colors() {
				return new Proxy({ primary: 'red' }, {})
			}
		}
		const pika = staticContext({
			theme: new ThemeRoot(),
			lists: { spacing: ['0', '4px'] },
		})

		expect(evaluate('pika.theme.colors.primary', { pika }))
			.toBe('red')
		expect(evaluate('(pika[\'lists\'] as any).spacing[1]', { pika }))
			.toBe('4px')
	})

	it('distinguishes unknown roots from registered undefined terminals', () => {
		const pika = staticContext({ maybe: undefined })
		expect(evaluate('pika.maybe', { pika }))
			.toBeUndefined()
		expect(() => evaluate('pika.missing', { pika }))
			.toThrow('unknown Pika static-extension root "missing"')
	})

	it('rejects non-string/number computed keys and non-Pika member expressions through the same evaluator', () => {
		const pika = staticContext({ theme: { color: 'red' } })
		expect(() => evaluate('pika.theme[{}]', { pika }))
			.toThrow('member key does not evaluate to a string or number')
		expect(() => evaluate('other.theme', { pika }))
			.toThrow('unsupported expression of type MemberExpression')
	})

	it('reports missing intermediate properties as ordinary synchronous traversal failures', () => {
		const pika = staticContext({ theme: {} })
		expect(() => evaluate('pika.theme.missing.value', { pika }))
			.toThrow('static-extension property traversal failed')
	})

	it('reports synchronous property traversal failures at the extension expression', () => {
		const pika = staticContext({
			theme: {
				get colors() {
					throw new Error('getter boom')
				},
			},
		})
		try {
			evaluate('pika.theme.colors.primary', { pika, stage: 'prepare' })
			expect.unreachable()
		}
		catch (error: any) {
			expect(error)
				.toBeInstanceOf(PikaTransformError)
			expect(error.stage)
				.toBe('prepare')
			expect(error.loc)
				.toEqual({ line: 1, column: 0 })
			expect(error.message)
				.toContain('getter boom')
		}
	})

	it('snapshots plain and null-prototype records without prototype pollution', () => {
		const plain: Record<string, unknown> = { nested: { value: 1 } }
		Object.defineProperty(plain, '__proto__', { value: { polluted: true }, enumerable: true })
		const nullProto = Object.assign(Object.create(null), { value: 'ok' })
		const pika = staticContext({ plain, nullProto })

		const plainResult = evaluate('pika.plain', { pika }) as Record<string, unknown>
		expect(plainResult)
			.toEqual(plain)
		expect(plainResult)
			.not.toBe(plain)
		expect(Object.hasOwn(plainResult, '__proto__'))
			.toBe(true)
		expect(Object.getPrototypeOf(plainResult))
			.toBe(Object.prototype)
		expect(({} as any).polluted)
			.toBeUndefined()

		const nullResult = evaluate('pika.nullProto', { pika }) as Record<string, unknown>
		expect(nullResult.value)
			.toBe('ok')
		expect(Object.getPrototypeOf(nullResult))
			.toBeNull()
	})

	it('preserves sparse extension arrays instead of materializing holes as undefined', () => {
		const sparse: unknown[] = []
		sparse.length = 4
		sparse[1] = 'one'
		sparse[3] = { value: 3 }
		const result = evaluate('pika.items', { pika: staticContext({ items: sparse }) }) as unknown[]

		expect(result)
			.not.toBe(sparse)
		expect(result.length)
			.toBe(4)
		expect(0 in result)
			.toBe(false)
		expect(1 in result)
			.toBe(true)
		expect(2 in result)
			.toBe(false)
		expect(result[1])
			.toBe('one')
		expect(result[3])
			.toEqual({ value: 3 })
	})

	it('rejects cycles and shared object identity in terminal graphs', () => {
		const cyclic: Record<string, unknown> = {}
		cyclic.self = cyclic
		const shared = { value: 1 }
		const aliased = { a: shared, b: shared }

		expect(() => evaluate('pika.cyclic', { pika: staticContext({ cyclic }) }))
			.toThrow('cycle or shared object identity')
		expect(() => evaluate('pika.aliased', { pika: staticContext({ aliased }) }))
			.toThrow('cycle or shared object identity')
	})

	it('rejects enumerable symbol properties and custom enumerable array properties', () => {
		const symbolRecord: Record<PropertyKey, unknown> = { ok: true }
		symbolRecord[Symbol('hidden-identity')] = 'bad'
		const array = ['ok'] as unknown[] & Record<string, unknown>
		array.extra = 'bad'

		expect(() => evaluate('pika.symbolRecord', { pika: staticContext({ symbolRecord }) }))
			.toThrow('enumerable symbol property')
		expect(() => evaluate('pika.array', { pika: staticContext({ array }) }))
			.toThrow('custom enumerable property "extra"')
	})

	it('rejects runtime-only terminal values and special objects', async () => {
		class Instance {}
		class ArraySubclass extends Array<string> {
			constructor(...items: string[]) { super(...items) }
		}
		for (const [name, value] of Object.entries({
			fn: () => 1,
			promise: Promise.resolve(1),
			bigint: 1n,
			date: new Date(),
			map: new Map(),
			set: new Set(),
			regex: /x/,
			instance: new Instance(),
			arraySubclass: new ArraySubclass('x'),
		})) {
			expect(() => evaluate(`pika.${name}`, { pika: staticContext({ [name]: value }) }), name)
				.toThrow(PikaTransformError)
		}
		expect(() => evaluate('pika.symbol', { pika: staticContext({ symbol: Symbol('x') }) }))
			.toThrow('contains a symbol')
	})

	it('wraps getter/proxy failures encountered while snapshotting a terminal record', () => {
		const record = Object.defineProperty({}, 'bad', {
			enumerable: true,
			get() {
				throw new Error('snapshot boom')
			},
		})
		expect(() => evaluate('pika.record', { pika: staticContext({ record }) }))
			.toThrow('terminal materialization failed: snapshot boom')
	})
})
