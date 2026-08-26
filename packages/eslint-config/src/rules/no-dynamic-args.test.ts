import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import rule from './no-dynamic-args'

interface Report {
	messageId: string
	data: Record<string, string>
	node: unknown
}

function createContext(options?: { fnName?: string }, scope?: any) {
	const reports: Report[] = []

	return {
		context: {
			options: options == null ? [] : [options],
			report(report: Report) {
				reports.push(report)
			},
			sourceCode: {
				parserServices: undefined,
				// Only wire getScope when a test supplies a scope; the rule uses
				// optional chaining, so absence mirrors "no scope info available".
				getScope: scope === undefined ? undefined : () => scope,
			},
		},
		reports,
	}
}

function createCallExpression(callee: any, args: any[]) {
	return {
		type: 'CallExpression',
		callee,
		arguments: args,
	}
}

function runRule(node: any, options?: { fnName?: string }, scope?: any) {
	const { context, reports } = createContext(options, scope)
	const visitor = rule.create(context as any) as { CallExpression: (node: any) => void }

	visitor.CallExpression(node)

	return reports
}

describe('no-dynamic-args rule metadata', () => {
	it('declares messages, schema, and a default fnName option', () => {
		expect(rule.meta)
			.toMatchObject({
				type: 'problem',
				defaultOptions: [{ fnName: 'pika' }],
				messages: {
					noDynamicArg: expect.stringContaining('static-subset violation'),
					noDynamicProperty: expect.stringContaining('static-subset violation'),
					noDynamicSpread: expect.stringContaining('Spread of dynamic value'),
					noDynamicComputedKey: expect.stringContaining('Computed property key'),
				},
			})
		expect(rule.meta?.schema)
			.toHaveLength(1)
	})
})

describe('no-dynamic-args rule visitor creation', () => {
	it('registers the same call-expression visitor for script and template bodies when parser services expose one', () => {
		const defineTemplateBodyVisitor = (templateVisitor: unknown, scriptVisitor: unknown) => ({
			templateVisitor,
			scriptVisitor,
		})
		const context = {
			options: [],
			report() {},
			sourceCode: {
				parserServices: {
					defineTemplateBodyVisitor,
				},
			},
		}

		const visitor = rule.create(context as any) as unknown as Record<string, Record<string, unknown>>

		expect(visitor.templateVisitor)
			.toEqual({ CallExpression: expect.any(Function) })
		expect(visitor.scriptVisitor)
			.toEqual({ CallExpression: expect.any(Function) })
		expect(visitor.templateVisitor)
			.toEqual(visitor.scriptVisitor)
	})
})

describe('no-dynamic-args rule behavior', () => {
	it('ignores calls whose callee name does not match the configured pika patterns', () => {
		expect(runRule(createCallExpression(
			{ type: 'Identifier', name: 'notPika' },
			[{ type: 'Identifier', name: 'value' }],
		)))
			.toEqual([])
	})

	it('accepts static literals, unary expressions, static arrays, and static objects', () => {
		expect(runRule(createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[
				{ type: 'Literal', value: 'red' },
				{
					type: 'TemplateLiteral',
					expressions: [],
					quasis: [{ value: { cooked: 'solid' } }],
				},
				{
					type: 'UnaryExpression',
					operator: '-',
					argument: { type: 'Literal', value: 1 },
				},
				{
					type: 'UnaryExpression',
					operator: '+',
					argument: { type: 'Literal', value: 2 },
				},
				{
					type: 'ArrayExpression',
					elements: [
						null,
						{ type: 'Literal', value: 'value' },
						{ type: 'SpreadElement', argument: { type: 'ArrayExpression', elements: [] } },
					],
				},
				{
					type: 'ObjectExpression',
					properties: [
						{
							type: 'Property',
							computed: false,
							key: { type: 'Identifier', name: 'color' },
							value: { type: 'Literal', value: 'red' },
						},
						{
							type: 'Property',
							computed: true,
							key: { type: 'Literal', value: 'margin' },
							value: { type: 'ArrayExpression', elements: [{ type: 'Literal', value: '0' }] },
						},
						{
							type: 'SpreadElement',
							argument: {
								type: 'ObjectExpression',
								properties: [],
							},
						},
					],
				},
			],
		)))
			.toEqual([])
	})

	it('reports dynamic property values, computed keys, nested array items, and dynamic spreads', () => {
		const reports = runRule(createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[
				{
					type: 'ObjectExpression',
					properties: [
						{
							type: 'Property',
							computed: true,
							key: { type: 'Identifier', name: 'dynamicKey' },
							value: { type: 'Literal', value: 'red' },
						},
						{
							type: 'Property',
							computed: false,
							key: { type: 'Identifier', name: 'nested' },
							value: {
								type: 'ArrayExpression',
								elements: [
									{ type: 'Literal', value: 'ok' },
									{ type: 'CallExpression' },
								],
							},
						},
						{
							type: 'SpreadElement',
							argument: { type: 'Identifier', name: 'spreadValue' },
						},
					],
				},
			],
		))

		expect(reports)
			.toEqual([
				{
					messageId: 'noDynamicComputedKey',
					data: {
						fnName: 'pika',
						reason: 'Variable reference \'dynamicKey\' is not statically analyzable',
					},
					node: { type: 'Identifier', name: 'dynamicKey' },
				},
				{
					messageId: 'noDynamicArg',
					data: {
						fnName: 'pika',
						reason: 'Function calls are not statically analyzable',
					},
					node: { type: 'CallExpression' },
				},
				{
					messageId: 'noDynamicSpread',
					data: {
						fnName: 'pika',
					},
					node: {
						type: 'SpreadElement',
						argument: { type: 'Identifier', name: 'spreadValue' },
					},
				},
			])
	})

	it('reports non-static property values and dynamic array spreads with property-level messages', () => {
		const reports = runRule(createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[
				{
					type: 'ObjectExpression',
					properties: [
						{
							type: 'Property',
							computed: false,
							key: { type: 'Identifier', name: 'color' },
							value: { type: 'MemberExpression' },
						},
						{
							type: 'Property',
							computed: false,
							key: { type: 'Identifier', name: 'tokens' },
							value: {
								type: 'ArrayExpression',
								elements: [
									{
										type: 'SpreadElement',
										argument: { type: 'Identifier', name: 'dynamicList' },
									},
								],
							},
						},
					],
				},
			],
		))

		expect(reports)
			.toEqual([
				{
					messageId: 'noDynamicProperty',
					data: {
						fnName: 'pika',
						reason: 'Member expressions are not statically analyzable',
					},
					node: { type: 'MemberExpression' },
				},
				{
					messageId: 'noDynamicSpread',
					data: {
						fnName: 'pika',
					},
					node: {
						type: 'SpreadElement',
						argument: { type: 'Identifier', name: 'dynamicList' },
					},
				},
			])
	})

	it('skips sparse entries while still reporting dynamic members inside a non-static array argument', () => {
		const reports = runRule(createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[
				{
					type: 'ArrayExpression',
					elements: [
						null,
						{ type: 'Identifier', name: 'value' },
					],
				},
			],
		))

		expect(reports)
			.toEqual([
				{
					messageId: 'noDynamicArg',
					data: {
						fnName: 'pika',
						reason: 'Variable reference \'value\' is not statically analyzable',
					},
					node: { type: 'Identifier', name: 'value' },
				},
			])
	})

	it.each([
		['Identifier', { type: 'Identifier', name: 'value' }, 'noDynamicArg', 'Variable reference \'value\' is not statically analyzable'],
		['ConditionalExpression', { type: 'ConditionalExpression' }, 'noDynamicArg', 'Conditional expressions are not statically analyzable'],
		['BinaryExpression', { type: 'BinaryExpression', operator: '+' }, 'noDynamicArg', '\'+\' expressions are not statically analyzable'],
		['LogicalExpression', { type: 'LogicalExpression', operator: '&&' }, 'noDynamicArg', '\'&&\' expressions are not statically analyzable'],
		['MemberExpression', { type: 'MemberExpression' }, 'noDynamicArg', 'Member expressions are not statically analyzable'],
		['TaggedTemplateExpression', { type: 'TaggedTemplateExpression' }, 'noDynamicArg', 'Tagged template expressions are not statically analyzable'],
		['NewExpression', { type: 'NewExpression' }, 'noDynamicArg', 'New expressions are not statically analyzable'],
		['AwaitExpression', { type: 'AwaitExpression' }, 'noDynamicArg', 'Await expressions are not statically analyzable'],
		['YieldExpression', { type: 'YieldExpression' }, 'noDynamicArg', 'Yield expressions are not statically analyzable'],
		['AssignmentExpression', { type: 'AssignmentExpression' }, 'noDynamicArg', 'Assignment expressions are not statically analyzable'],
		['SequenceExpression', { type: 'SequenceExpression' }, 'noDynamicArg', 'Sequence expressions are not statically analyzable'],
		['UnknownExpression', { type: 'UnknownExpression' }, 'noDynamicArg', 'This expression is not statically analyzable'],
	])('reports %s nodes with a specific reason', (_type, argNode, messageId, reason) => {
		const reports = runRule(createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[argNode],
		))

		expect(reports)
			.toEqual([
				{
					messageId,
					data: {
						fnName: 'pika',
						reason,
					},
					node: argNode,
				},
			])
	})

	it('reports the failing interpolated expression of a dynamic template literal', () => {
		const inner = { type: 'Identifier', name: 'size' }
		const argNode = {
			type: 'TemplateLiteral',
			expressions: [inner],
			quasis: [{ value: { cooked: 'p-' } }, { value: { cooked: '' } }],
		}
		expect(runRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [argNode])))
			.toEqual([
				{
					messageId: 'noDynamicArg',
					data: {
						fnName: 'pika',
						reason: 'Variable reference \'size\' is not statically analyzable',
					},
					node: inner,
				},
			])
	})

	it('treats member calls on a custom configured root as reserved-syntax errors', () => {
		const callee = {
			type: 'MemberExpression',
			computed: false,
			object: { type: 'Identifier', name: 'styled' },
			property: { type: 'Identifier', name: 'arr' },
		}
		expect(runRule(createCallExpression(
			callee,
			[{ type: 'SpreadElement', argument: { type: 'Identifier', name: 'tokens' } }],
		), { fnName: 'styled' }))
			.toEqual([{
				messageId: 'invalidPikaSyntax',
				data: { fnName: 'styled' },
				node: callee,
			}])
	})

	it('skips static spreads inside otherwise non-static objects, arrays, and top-level arguments', () => {
		// static spread in a non-static object: only the dynamic prop is reported
		const objReports = runRule(createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[{
				type: 'ObjectExpression',
				properties: [
					{ type: 'SpreadElement', argument: { type: 'ObjectExpression', properties: [] } },
					{ type: 'Property', computed: false, key: { type: 'Identifier', name: 'x' }, value: { type: 'Identifier', name: 'dyn' } },
				],
			}],
		))
		expect(objReports)
			.toHaveLength(1)
		expect(objReports[0]!.messageId)
			.toBe('noDynamicProperty')

		// static spread in a non-static array: only the dynamic element is reported
		const arrReports = runRule(createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[{
				type: 'ArrayExpression',
				elements: [
					{ type: 'SpreadElement', argument: { type: 'ArrayExpression', elements: [] } },
					{ type: 'Identifier', name: 'dyn' },
				],
			}],
		))
		expect(arrReports)
			.toHaveLength(1)
		expect(arrReports[0]!.messageId)
			.toBe('noDynamicArg')

		// static array top-level spread alongside a dynamic argument (call-level
		// spreads must be arrays, matching the compiler's evaluateCallArgs)
		const topReports = runRule(createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[
				{ type: 'SpreadElement', argument: { type: 'ArrayExpression', elements: [] } },
				{ type: 'Identifier', name: 'dyn' },
			],
		))
		expect(topReports)
			.toHaveLength(1)
		expect(topReports[0]!.messageId)
			.toBe('noDynamicArg')
	})
})

describe('no-dynamic-args compiler-aligned static subset', () => {
	const lit = (value: any) => ({ type: 'Literal', value })

	it('accepts the operators the compiler evaluates when operands are static', () => {
		const staticArgs: any[] = [
			// binary: 1 + 2
			{ type: 'BinaryExpression', operator: '+', left: lit(1), right: lit(2) },
			// binary comparison: 'a' === 'b'
			{ type: 'BinaryExpression', operator: '===', left: lit('a'), right: lit('b') },
			// logical: true && 'x'
			{ type: 'LogicalExpression', operator: '&&', left: lit(true), right: lit('x') },
			// nullish: null ?? 'x'
			{ type: 'LogicalExpression', operator: '??', left: lit(null), right: lit('x') },
			// conditional: true ? 'a' : 'b'
			{ type: 'ConditionalExpression', test: lit(true), consequent: lit('a'), alternate: lit('b') },
			// template with a static expression: `x-${1}`
			{ type: 'TemplateLiteral', expressions: [lit(1)], quasis: [{ value: { cooked: 'x-' } }, { value: { cooked: '' } }] },
			// unary not / void
			{ type: 'UnaryExpression', operator: '!', argument: lit(0) },
			{ type: 'UnaryExpression', operator: 'void', argument: lit(0) },
			// unshadowed global constants
			{ type: 'Identifier', name: 'undefined' },
			{ type: 'Identifier', name: 'NaN' },
			{ type: 'Identifier', name: 'Infinity' },
		]
		for (const arg of staticArgs) {
			expect(runRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [arg])), JSON.stringify(arg))
				.toEqual([])
		}
	})

	it('still reports operator expressions whose operands are dynamic', () => {
		const dynamicArgs: any[] = [
			{ type: 'BinaryExpression', operator: '+', left: { type: 'Identifier', name: 'a' }, right: { type: 'Identifier', name: 'b' } },
			{ type: 'ConditionalExpression', test: { type: 'Identifier', name: 'cond' }, consequent: lit('a'), alternate: lit('b') },
			// unsupported operator (bitwise) even with static operands
			{ type: 'BinaryExpression', operator: '&', left: lit(1), right: lit(2) },
			// template with a dynamic expression
			{ type: 'TemplateLiteral', expressions: [{ type: 'Identifier', name: 'x' }], quasis: [{ value: { cooked: '' } }, { value: { cooked: '' } }] },
		]
		for (const arg of dynamicArgs) {
			expect(runRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [arg])), JSON.stringify(arg))
				.toHaveLength(1)
		}
	})

	it('treats a global-constant name shadowed by a real declaration as dynamic', () => {
		const scope = { variables: [{ name: 'undefined', defs: [{}] }], upper: null }
		expect(runRule(
			createCallExpression({ type: 'Identifier', name: 'pika' }, [{ type: 'Identifier', name: 'undefined' }]),
			undefined,
			scope,
		))
			.toHaveLength(1)
	})

	it('does not treat the ambient global-scope variable (zero defs) as shadowing', () => {
		// ESLint's global scope always contains undefined/NaN/Infinity with an
		// empty defs array; Babel getBinding (the compiler) ignores those.
		const scope = { variables: [{ name: 'undefined', defs: [] }], upper: null }
		expect(runRule(
			createCallExpression({ type: 'Identifier', name: 'pika' }, [{ type: 'Identifier', name: 'undefined' }]),
			undefined,
			scope,
		))
			.toEqual([])
	})
})

describe('no-dynamic-args callee scope shadowing', () => {
	function callWithArg() {
		return createCallExpression(
			{ type: 'Identifier', name: 'pika' },
			[{ type: 'Identifier', name: 'dynamic' }],
		)
	}

	it('skips the call when the callee root is a local binding', () => {
		const scope = { variables: [{ name: 'pika', defs: [{}] }], upper: null }
		expect(runRule(callWithArg(), undefined, scope))
			.toEqual([])
	})

	it('skips the call when the callee root is declared in an outer scope', () => {
		const scope = { variables: [], upper: { variables: [{ name: 'pika', defs: [{}] }], upper: null } }
		expect(runRule(callWithArg(), undefined, scope))
			.toEqual([])
	})

	it('still reports when the callee root is unresolved (the build-time macro)', () => {
		const scope = { variables: [], upper: null }
		expect(runRule(callWithArg(), undefined, scope))
			.toHaveLength(1)
	})

	it('still reports when the callee root is only an ambient global (zero defs)', () => {
		// Regression: `languageOptions.globals: { pika: 'readonly' }` puts a
		// zero-defs variable in the global scope; the transformer still rewrites
		// bare pika() calls, so the rule must keep checking them.
		const scope = { variables: [{ name: 'pika', defs: [] }], upper: null }
		expect(runRule(callWithArg(), undefined, scope))
			.toHaveLength(1)
	})

	it('does not skip a same-named binding for a different member variant', () => {
		// `styled.str(dynamic)` with only `pika` in scope stays reported.
		const node = createCallExpression(
			{ type: 'MemberExpression', computed: false, object: { type: 'Identifier', name: 'styled' }, property: { type: 'Identifier', name: 'str' } },
			[{ type: 'Identifier', name: 'dynamic' }],
		)
		const scope = { variables: [{ name: 'pika', defs: [{}] }], upper: null }
		expect(runRule(node, { fnName: 'styled' }, scope))
			.toHaveLength(1)
	})
})

describe('no-dynamic-args value-aware evaluation edge nodes', () => {
	const lit = (value: any) => ({ type: 'Literal', value })
	const pikaCall = (...args: any[]) => createCallExpression({ type: 'Identifier', name: 'pika' }, args)

	it('unwraps TypeScript assertion wrappers and parentheses like the compiler', () => {
		expect(runRule(pikaCall({
			type: 'TSAsExpression',
			expression: { type: 'ParenthesizedExpression', expression: lit('red') },
		})))
			.toEqual([])
	})

	it('reports a wrapper whose inner expression is missing on the wrapper itself', () => {
		const argNode = { type: 'TSNonNullExpression', expression: undefined }
		const reports = runRule(pikaCall(argNode))
		expect(reports)
			.toHaveLength(1)
		expect(reports[0])
			.toMatchObject({ messageId: 'noDynamicArg', node: argNode })
	})

	it('reports template literals with an invalid escape sequence (compiler hard error)', () => {
		const argNode = { type: 'TemplateLiteral', expressions: [], quasis: [{ value: { cooked: null } }] }
		const reports = runRule(pikaCall(argNode))
		expect(reports)
			.toEqual([
				{
					messageId: 'noDynamicArg',
					data: { fnName: 'pika', reason: 'Template literal contains an invalid escape sequence' },
					node: argNode,
				},
			])
	})

	it('reports unsupported logical operators even with static operands', () => {
		const argNode = { type: 'LogicalExpression', operator: '~>', left: lit(1), right: lit(2) }
		const reports = runRule(pikaCall(argNode))
		expect(reports)
			.toEqual([
				{
					messageId: 'noDynamicArg',
					data: { fnName: 'pika', reason: '\'~>\' expressions are not statically analyzable' },
					node: argNode,
				},
			])
	})

	it('reports malformed operator nodes with missing children on the containing node', () => {
		const unary = { type: 'UnaryExpression', operator: '-' }
		expect(runRule(pikaCall(unary)))
			.toEqual([
				{
					messageId: 'noDynamicArg',
					data: { fnName: 'pika', reason: '\'-\' expressions are not statically analyzable' },
					node: unary,
				},
			])
	})

	it('reports object properties with a missing value on the property node', () => {
		const prop = { type: 'Property', computed: false, key: { type: 'Identifier', name: 'a' } }
		const reports = runRule(pikaCall({ type: 'ObjectExpression', properties: [prop] }))
		expect(reports)
			.toHaveLength(1)
		expect(reports[0])
			.toMatchObject({ messageId: 'noDynamicProperty', node: prop })
	})

	it('reports array spreads with a missing argument as dynamic spreads', () => {
		const spread = { type: 'SpreadElement' }
		const reports = runRule(pikaCall({ type: 'ArrayExpression', elements: [spread] }))
		expect(reports)
			.toHaveLength(1)
		expect(reports[0])
			.toMatchObject({ messageId: 'noDynamicSpread', node: spread })
	})

	it('reports non-Property object members (e.g. Babel-only ObjectMethod shapes)', () => {
		const member = { type: 'ObjectMethod' }
		const reports = runRule(pikaCall({ type: 'ObjectExpression', properties: [member] }))
		expect(reports)
			.toEqual([
				{
					messageId: 'noDynamicProperty',
					data: { fnName: 'pika', reason: 'This expression is not statically analyzable' },
					node: member,
				},
			])
	})
})

// The fixtures below are strings of source code, so `${...}` inside ordinary
// string literals is intentional.
/* eslint-disable no-template-curly-in-string */
describe('no-dynamic-args with real ESLint scope analysis', () => {
	function lintCode(code: string, globals: Record<string, 'readonly' | 'writable'> = {}) {
		const linter = new Linter()
		return linter.verify(code, {
			plugins: { pikacss: { rules: { 'no-dynamic-args': rule } } },
			rules: { 'pikacss/no-dynamic-args': 'error' },
			languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals },
		})
	}

	it.each([
		// Defect 1: ambient globals are always in ESLint's global scope but are
		// NOT local bindings — the compiler evaluates them.
		'pika(undefined)',
		'pika(NaN)',
		'pika(Infinity)',
		// Defect 2: short-circuit — the dead operand may be dynamic.
		'pika(false && dyn)',
		'pika(true || dyn)',
		'pika("base" ?? dyn)',
		'pika(true ? "a" : dyn)',
		'pika(false ? dyn : "b")',
		'pika(false || "x")',
		'pika(null ?? "x")',
		// Value-producing operators the compiler evaluates.
		'pika("x-" + 1)',
		'pika(1 + 2)',
		'pika(3 - 1)',
		'pika(4 * 2)',
		'pika(8 / 2)',
		'pika("a" === "a")',
		'pika("a" !== "b")',
		// JS number coercion: the compiler computes (null as number) - (null as number) === 0.
		'pika(null - null)',
		'pika(!0)',
		'pika(void 0)',
		'pika(-1)',
		'pika(+"2")',
		// Template interpolation: null/undefined/boolean/number/string are allowed.
		'pika(`x-${null}`)',
		'pika(`x-${undefined}`)',
		'pika(`x-${true}`)',
		'pika(`x-${1 + 2}`)',
		// Spread shapes the compiler accepts.
		'pika(...["a"])',
		'pika([...["a"], "b"])',
		'pika({ ...{ color: "red" } })',
		// Object keys: static computed string/number keys and literal keys.
		'pika({ ["color"]: "red", [0]: "x", 1.5: "y", "quoted": 1 })',
		// Callee shadowed by a real local binding: the user's own function.
		'const pika = (v) => v; pika(dyn)',
	])('accepts %s', (code) => {
		expect(lintCode(code))
			.toEqual([])
	})

	it.each([
		// Defect 1 mirror: a real declaration shadows the global constant.
		['const undefined = 1; pika(undefined)', 'noDynamicArg'],
		['function f(NaN) { pika(NaN) }', 'noDynamicArg'],
		['pika(dyn)', 'noDynamicArg'],
		// Needed operands must be static.
		['pika(true && dyn)', 'noDynamicArg'],
		['pika(false || dyn)', 'noDynamicArg'],
		['pika(null ?? dyn)', 'noDynamicArg'],
		['pika(cond ? "a" : "b")', 'noDynamicArg'],
		// Defect 3: compiler hard errors on type-invalid static forms.
		['pika(null + null)', 'noDynamicArg'],
		['pika(true + 1)', 'noDynamicArg'],
		['pika(`x-${{ a: 1 }}`)', 'noDynamicArg'],
		['pika(`x-${[1]}`)', 'noDynamicArg'],
		['pika(...{})', 'noDynamicSpread'],
		['pika(...dyn)', 'noDynamicSpread'],
		['pika({ ...[1] })', 'noDynamicSpread'],
		['pika({ ...null })', 'noDynamicSpread'],
		['pika([...{ a: 1 }])', 'noDynamicSpread'],
		['pika({ [null]: "x" })', 'noDynamicComputedKey'],
		['pika({ [dyn]: "x" })', 'noDynamicComputedKey'],
		['pika({ 1n: "x" })', 'noDynamicProperty'],
		['pika({ color: dyn })', 'noDynamicProperty'],
		['pika({ get a() { return 1 } })', 'noDynamicProperty'],
		// Unsupported literal kinds and operators.
		['pika(/x/)', 'noDynamicArg'],
		['pika(1n)', 'noDynamicArg'],
		['pika(typeof "a")', 'noDynamicArg'],
		['pika(1 % 2)', 'noDynamicArg'],
	])('reports %s', (code, messageId) => {
		const messages = lintCode(code)
		expect(messages)
			.toHaveLength(1)
		expect(messages[0]!.messageId)
			.toBe(messageId)
	})

	it('reports inherited Object.prototype keys like the compiler evaluator', () => {
		// Alignment lock: the compiler's own-key global-constant lookup rejects
		// `pika(toString)` / `pika(hasOwnProperty)`; the rule must report them too.
		for (const code of ['pika(toString)', 'pika(hasOwnProperty)']) {
			const messages = lintCode(code)
			expect(messages, code)
				.toHaveLength(1)
			expect(messages[0]!.messageId)
				.toBe('noDynamicArg')
		}
	})

	it('keeps checking pika() calls when pika is only a configured ESLint global', () => {
		// Regression: `languageOptions.globals: { pika: 'readonly' }` (a common
		// way to silence no-undef) made the callee look like a local binding and
		// silenced the rule for every call.
		const globals = { pika: 'readonly' } as const
		const messages = lintCode('pika(dynamicVar)', globals)
		expect(messages)
			.toHaveLength(1)
		expect(messages[0]!.messageId)
			.toBe('noDynamicArg')
		// Static calls stay accepted with the global configured.
		expect(lintCode('pika({ color: "red" })', globals))
			.toEqual([])
	})

	it('still skips a genuinely shadowed pika even with the global configured', () => {
		expect(lintCode('const pika = (v) => v; pika(dynamicVar)', { pika: 'readonly' }))
			.toEqual([])
	})

	it('explains compiler hard errors in the report message', () => {
		const messages = lintCode('pika(null + null)')
		expect(messages[0]!.message)
			.toContain('\'+\' on operands that are neither strings nor two numbers')
	})
})
/* eslint-enable no-template-curly-in-string */
