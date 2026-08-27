/* eslint-disable no-template-curly-in-string -- test strings are source fixtures */

import type { LintProjectModel } from '../lint-project'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { Linter } from 'eslint'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import pikacss from '../index'
import { evaluateStatic, getDynamicReason } from '../static-evaluate'
import { getCalleeName, getCalleeRootName } from '../utils/fn-names'
import { createStaticUsageRule } from './static-usage'

const testModel: LintProjectModel = {
	projectRoot: '/test',
	stateDir: '/test/.pikacss',
	roots: ['pika'],
	entries: [{
		index: 0,
		engine: {},
		fnName: 'pika',
		cssModule: 'pika.css',
		transformedFormat: 'string',
		scan: { include: ['/test/**'], exclude: [] },
		report: false,
		matcher: { matches: () => true },
	}],
}

const rule = createStaticUsageRule(testModel)

const defineConfigPath = new URL('../../../config/src/index.ts', import.meta.url).pathname
const created: string[] = []
const originalCwd = process.cwd()

async function createProject(configSource: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'pikacss-eslint-'))
	created.push(root)
	await mkdir(root, { recursive: true })
	await writeFile(join(root, 'pika.config.mts'), [
		`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
		configSource,
	].join('\n'))
	process.chdir(root)
	return root
}

async function lint(config: any, code: string, filename?: string): Promise<Linter.LintMessage[]> {
	// Linter.verify requires a filename applicability pattern for absolute
	// filenames; this test-only pattern is deliberately broader than Pika scan
	// ownership and is not produced by the factory.
	return new Linter({ cwd: process.cwd() })
		.verify(code, { ...config, files: ['**/*.ts'] }, filename)
}

afterEach(async () => {
	process.chdir(originalCwd)
	await Promise.all(created.splice(0)
		.map(path => rm(path, { recursive: true, force: true })))
})

describe('static-usage rule', () => {
	it('accepts no rule options and still preserves the existing static evaluator behavior', async () => {
		const root = await createProject('export default defineConfig({ scan: { include: "src/**/*.ts" } })')
		const config = await pikacss()

		expect(config.rules)
			.toEqual({ 'pikacss/static-usage': 'error' })
		expect((config.plugins as any).pikacss.rules)
			.toEqual({ 'static-usage': expect.any(Object) })
		expect((config.plugins as any).pikacss.rules['no-dynamic-args'])
			.toBeUndefined()
		expect(await lint(config, 'pika({ color: "red" })', join(root, 'src/styles.ts')))
			.toEqual([])
		const messages = await lint(config, 'pika(dynamicValue)', join(root, 'src/styles.ts'))
		expect(messages)
			.toHaveLength(1)
		expect(messages[0]?.ruleId)
			.toBe('pikacss/static-usage')
		expect(messages[0]?.messageId)
			.toBe('noDynamicArg')
	})

	it('reports configured roots in zero-match files and permits a matching single entry', async () => {
		const root = await createProject('export default defineConfig({ scan: { include: "src/**/*.ts" } })')
		const config = await pikacss()

		expect(await lint(config, 'pika({})', join(root, 'src/styles.ts')))
			.toEqual([])
		const messages = await lint(config, 'pika({})', join(root, 'test/styles.ts'))
		expect(messages)
			.toHaveLength(1)
		expect(messages[0]?.messageId)
			.toBe('outsideScan')
	})

	it('derives sibling roots as readonly globals and permits each matching entry', async () => {
		const root = await createProject(`export default defineConfig([
			{ fnName: 'pika', cssModule: 'pika.css', scan: { include: 'src/pika/**/*.ts' } },
			{ fnName: 'css', cssModule: 'css.css', scan: { include: 'src/shared/**/*.ts' } },
		])`)
		const config = await pikacss()

		expect(config.languageOptions?.globals)
			.toEqual({ pika: 'readonly', css: 'readonly' })
		expect(await lint(config, 'pika({}); css({})', join(root, 'src/shared/styles.ts')))
			.toEqual([
			// The file is owned only by css; pika is intentionally outside its entry.
				expect.objectContaining({ messageId: 'outsideScan' }),
			])

		expect(await lint(config, 'pika({}); css({})', join(root, 'src/pika/styles.ts')))
			.toEqual([
				expect.objectContaining({ messageId: 'outsideScan' }),
			])

		const overlap = join(root, 'src/overlap/styles.ts')
		await mkdir(dirname(overlap), { recursive: true })
		// Replace both includes with the same overlap through an explicit config
		// reload in the next assertion; this keeps sibling ownership observable.
		await writeFile(join(root, 'pika.config.mts'), [
			`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
			`export default defineConfig([
				{ fnName: 'pika', cssModule: 'pika.css', scan: { include: 'src/**/*.ts' } },
				{ fnName: 'css', cssModule: 'css.css', scan: { include: 'src/**/*.ts' } },
			])`,
		].join('\n'))
		const overlapConfig = await pikacss()
		expect(await lint(overlapConfig, 'pika({}); css({})', overlap))
			.toEqual([])
	})

	it('rejects a cross-root dependency even when both entries own the physical source', async () => {
		const root = await createProject(`export default defineConfig([
			{ fnName: 'pika', cssModule: 'pika.css', scan: { include: 'src/**/*.ts' } },
			{ fnName: 'css', cssModule: 'css.css', scan: { include: 'src/**/*.ts' } },
		])`)
		const config = await pikacss()
		const messages = await lint(config, 'pika(css({ color: "red" }))', join(root, 'src/styles.ts'))

		expect(messages)
			.toEqual([
				expect.objectContaining({
					messageId: 'crossEntryDependency',
				}),
			])
	})

	it('ignores a local binding that shadows a configured root', async () => {
		const root = await createProject('export default defineConfig({ fnName: "pika", scan: { include: "src/**/*.ts" } })')
		const config = await pikacss()

		expect(await lint(config, 'const pika = (value) => value; pika(dynamicValue)', join(root, 'outside.ts')))
			.toEqual([])
	})
})

interface Report {
	messageId: string
	data?: Record<string, string>
	node: unknown
}

function createSyntheticContext(scope?: any, parserServices?: any) {
	const reports: Report[] = []
	return {
		context: {
			options: [],
			report(report: Report) {
				reports.push(report)
			},
			sourceCode: {
				parserServices,
				getScope: scope === undefined ? undefined : () => scope,
			},
		},
		reports,
	}
}

function createCallExpression(callee: any, args: any[]) {
	return { type: 'CallExpression', callee, arguments: args }
}

function runSyntheticRule(node: any, scope?: any) {
	const { context, reports } = createSyntheticContext(scope)
	const visitor = rule.create(context as any) as any
	visitor.CallExpression(node)
	visitor['CallExpression:exit']?.(node)
	return reports
}

function lintWithRule(ruleModule: any, code: string, filename = '/test/input.ts'): Linter.LintMessage[] {
	return new Linter({ cwd: '/test' })
		.verify(code, {
			files: ['**/*.ts'],
			plugins: { pikacss: { rules: { 'static-usage': ruleModule } } },
			rules: { 'pikacss/static-usage': 'error' },
			languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
		}, filename)
}

describe('static-usage internal rule behavior', () => {
	it('has no public rule options and registers the same visitor for template bodies', () => {
		expect(rule.meta?.schema)
			.toEqual([])
		expect(rule.meta?.messages)
			.toMatchObject({
				noDynamicArg: expect.stringContaining('static-subset violation'),
				outsideScan: expect.stringContaining('outside the scan scope'),
				crossEntryDependency: expect.stringContaining('another entry'),
			})
		const defineTemplateBodyVisitor = (templateVisitor: unknown, scriptVisitor: unknown) => ({ templateVisitor, scriptVisitor })
		const { context } = createSyntheticContext(undefined, { defineTemplateBodyVisitor })
		const visitor = rule.create(context as any) as any
		expect(visitor.templateVisitor)
			.toEqual({ 'CallExpression': expect.any(Function), 'CallExpression:exit': expect.any(Function), 'Identifier': expect.any(Function) })
		expect(visitor.scriptVisitor)
			.toBe(visitor.templateVisitor)
	})

	it('ignores non-configured calls and accepts recursively static ordinary arguments', () => {
		expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'other' }, [{ type: 'Identifier', name: 'dynamic' }])))
			.toEqual([])
		expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [
			{ type: 'Literal', value: 'red' },
			{ type: 'UnaryExpression', operator: '-', argument: { type: 'Literal', value: 1 } },
			{ type: 'ArrayExpression', elements: [null, { type: 'Literal', value: 'x' }, { type: 'SpreadElement', argument: { type: 'ArrayExpression', elements: [] } }] },
			{ type: 'ObjectExpression', properties: [
				{ type: 'Property', computed: false, key: { type: 'Identifier', name: 'color' }, value: { type: 'Literal', value: 'red' } },
				{ type: 'Property', computed: true, key: { type: 'Literal', value: 'margin' }, value: { type: 'Literal', value: 0 } },
				{ type: 'SpreadElement', argument: { type: 'ObjectExpression', properties: [] } },
			] },
		])))
			.toEqual([])
	})

	it('classifies extension values as engine-dependent without executing their implementations', () => {
		const identifier = (name: string) => ({ type: 'Identifier', name })
		const literal = (value: unknown) => ({ type: 'Literal', value })
		const member = (object: any, property: any, computed = false) => ({ type: 'MemberExpression', object, property, computed })
		const extension = member(identifier('pika'), identifier('theme'))
		const nestedExtension = member(extension, identifier('colors'))

		expect(evaluateStatic(extension, undefined))
			.toMatchObject({ kind: 'engine-dependent', ok: false })
		expect(evaluateStatic(nestedExtension, undefined).kind)
			.toBe('engine-dependent')
		expect(evaluateStatic(member(identifier('pika'), literal('theme'), true), undefined).kind)
			.toBe('engine-dependent')
		expect(evaluateStatic(member(identifier('pika'), { type: 'BinaryExpression', operator: '+', left: literal('the'), right: literal('me') }, true), undefined).kind)
			.toBe('engine-dependent')
		expect(evaluateStatic(extension, undefined, 'css').kind)
			.toBe('invalid')
		expect(evaluateStatic(member(identifier('css'), identifier('theme')), undefined, 'css').kind)
			.toBe('engine-dependent')
		expect(evaluateStatic(member(identifier('pika'), identifier('dynamicKey'), true), undefined).kind)
			.toBe('invalid')
		expect(evaluateStatic(member(identifier('pika'), literal(null), true), undefined).kind)
			.toBe('invalid')
		expect(evaluateStatic(member(identifier('pika'), extension, true), undefined).kind)
			.toBe('engine-dependent')
	})

	it('propagates engine-dependent state through static composition and proves known failures', () => {
		const literal = (value: unknown) => ({ type: 'Literal', value })
		const identifier = (name: string) => ({ type: 'Identifier', name })
		const extension = { type: 'MemberExpression', object: identifier('pika'), property: identifier('theme'), computed: false }
		const dependentBinary = { type: 'BinaryExpression', operator: '+', left: extension, right: literal(true) }
		const dependentTemplate = { type: 'TemplateLiteral', quasis: [{ value: { cooked: '' } }, { value: { cooked: '' } }], expressions: [extension] }
		const dependentArray = { type: 'ArrayExpression', elements: [{ type: 'SpreadElement', argument: extension }, literal('tail')] }
		const dependentObject = {
			type: 'ObjectExpression',
			properties: [{
				type: 'Property',
				computed: true,
				key: extension,
				value: literal('value'),
			}],
		}

		for (const node of [dependentBinary, dependentTemplate, dependentArray, dependentObject]) {
			expect(evaluateStatic(node, undefined).kind)
				.toBe('engine-dependent')
		}
		expect(evaluateStatic({ type: 'BinaryExpression', operator: '+', left: extension, right: identifier('dynamic') }, undefined).kind)
			.toBe('invalid')
		expect(evaluateStatic({ type: 'TemplateLiteral', quasis: [{ value: { cooked: '' } }, { value: { cooked: '' } }], expressions: [extension, { type: 'ObjectExpression', properties: [] }] }, undefined).kind)
			.toBe('invalid')
		expect(evaluateStatic({ type: 'ArrayExpression', elements: [{ type: 'SpreadElement', argument: extension }, identifier('dynamic')] }, undefined).kind)
			.toBe('invalid')
		expect(evaluateStatic({ type: 'ObjectExpression', properties: [{ type: 'Property', computed: true, key: extension, value: identifier('dynamic') }] }, undefined).kind)
			.toBe('invalid')
	})

	it('defers extension-controlled reachability but reports failures on every possible branch', () => {
		const extension = { type: 'MemberExpression', object: { type: 'Identifier', name: 'pika' }, property: { type: 'Identifier', name: 'theme' }, computed: false }
		const dynamic = { type: 'Identifier', name: 'dynamic' }
		const valid = { type: 'Literal', value: 'ok' }

		expect(evaluateStatic({ type: 'LogicalExpression', operator: '&&', left: extension, right: dynamic }, undefined).kind)
			.toBe('engine-dependent')
		expect(evaluateStatic({ type: 'LogicalExpression', operator: '||', left: extension, right: dynamic }, undefined).kind)
			.toBe('engine-dependent')
		expect(evaluateStatic({ type: 'LogicalExpression', operator: '??', left: extension, right: dynamic }, undefined).kind)
			.toBe('engine-dependent')
		expect(evaluateStatic({ type: 'ConditionalExpression', test: extension, consequent: dynamic, alternate: valid }, undefined).kind)
			.toBe('engine-dependent')
		expect(evaluateStatic({ type: 'ConditionalExpression', test: extension, consequent: dynamic, alternate: { type: 'Identifier', name: 'other' } }, undefined).kind)
			.toBe('invalid')
	})

	it('covers malformed and unsupported evaluator edge states', () => {
		const extension = { type: 'MemberExpression', object: { type: 'Identifier', name: 'pika' }, property: { type: 'Identifier', name: 'theme' }, computed: false }
		expect(evaluateStatic({ type: 'TemplateLiteral', quasis: null, expressions: [] }, undefined))
			.toMatchObject({ kind: 'known', value: '' })
		expect(evaluateStatic({ type: 'TemplateLiteral', quasis: [{ value: { cooked: 'x' } }], expressions: null }, undefined))
			.toMatchObject({ kind: 'known', value: 'x' })
		expect(evaluateStatic({ type: 'UnaryExpression', operator: '!', argument: extension }, undefined).kind)
			.toBe('engine-dependent')
		expect(evaluateStatic({ type: 'ArrayExpression', elements: null }, undefined))
			.toMatchObject({ kind: 'known', value: [] })
		expect(evaluateStatic({ type: 'ObjectExpression', properties: null }, undefined))
			.toMatchObject({ kind: 'known', value: {} })
		expect(evaluateStatic({
			type: 'ObjectExpression',
			properties: [{ type: 'Property', computed: false, key: null, value: { type: 'Literal', value: 1 } }],
		}, undefined).kind)
			.toBe('invalid')
		expect(evaluateStatic({
			type: 'MemberExpression',
			computed: true,
			object: { type: 'Identifier', name: 'pika' },
			property: { type: 'PrivateIdentifier', name: 'secret' },
		}, undefined).kind)
			.toBe('invalid')
		expect(evaluateStatic({ type: 'OptionalMemberExpression', object: extension, property: { type: 'Identifier', name: 'value' } }, undefined).kind)
			.toBe('invalid')
		expect(getDynamicReason(null))
			.toBe('This expression is not statically analyzable')
	})

	it('accepts direct extensions at every supported argument position and rejects only provable static failures', () => {
		for (const source of [
			'pika({ value: pika.theme.value })',
			'pika({ value: [pika.theme.value] })',
			'pika({ value: `${pika.theme.value}` })',
			'pika({ value: "x" + pika.theme.value })',
			'pika({ value: pika.theme.value && dynamicValue })',
			'pika({ value: pika.theme.value ? dynamicValue : "fallback" })',
			'pika({ ...pika.theme.options })',
			'pika([...pika.theme.options])',
			'pika(...pika.theme.options)',
			'pika({ [pika.keys.theme]: "red" })',
			'pika({ value: pika[pika.keys.theme] })',
		]) {
			expect(lintWithRule(rule, source, '/test/extension.ts'))
				.toEqual([])
		}

		expect(lintWithRule(rule, 'pika({ value: pika[dynamicKey] })', '/test/extension.ts')
			.map(message => message.messageId))
			.toEqual(['invalidPikaSyntax'])
		expect(lintWithRule(rule, 'pika({ value: pika[null] })', '/test/extension.ts')
			.map(message => message.messageId))
			.toEqual(['invalidPikaSyntax'])
		expect(lintWithRule(rule, 'pika({ value: pika[pika.keys.theme] })', '/test/extension.ts')
			.map(message => message.messageId))
			.toEqual([])
		expect(lintWithRule(rule, 'pika({ value: pika.theme ? dynamicValue : otherValue })', '/test/extension.ts')
			.map(message => message.messageId))
			.toEqual(['noDynamicProperty'])
	})

	it('enforces reserved extension placement, member-call, and nested-base grammar', () => {
		for (const source of [
			'pika(pika)',
			'pika.theme',
			'consume(pika.theme)',
			'pika({ value: pika?.theme })',
			'pika({ value: pika.theme() })',
			'pika({ value: new pika.theme() })',
			'pika({ value: pika.theme`value` })',
			'pika({ value: (pika.theme.value = "red") })',
			'pika({ value: pika({ color: "red" }) })',
		]) {
			expect(lintWithRule(rule, source, '/test/extension.ts')
				.some(message => message.messageId === 'invalidPikaSyntax'), source)
				.toBe(true)
		}
	})

	it('reports dynamic argument positions, wrong spreads, keys, and nested values', () => {
		const reports = runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [{
			type: 'ObjectExpression',
			properties: [
				{ type: 'Property', computed: true, key: { type: 'Identifier', name: 'dynamicKey' }, value: { type: 'Literal', value: 'red' } },
				{ type: 'Property', computed: false, key: { type: 'Identifier', name: 'nested' }, value: { type: 'ArrayExpression', elements: [{ type: 'CallExpression' }] } },
				{ type: 'SpreadElement', argument: { type: 'Identifier', name: 'spreadValue' } },
			],
		}]))
		expect(reports.map(report => report.messageId))
			.toEqual(['noDynamicComputedKey', 'noDynamicArg', 'noDynamicSpread'])

		for (const [argument, messageId] of [
			[{ type: 'Property', computed: false, key: { type: 'Identifier', name: 'x' }, value: { type: 'MemberExpression' } }, 'noDynamicProperty'],
			[{ type: 'ArrayExpression', elements: [{ type: 'SpreadElement', argument: { type: 'Identifier', name: 'items' } }] }, 'noDynamicSpread'],
			[{ type: 'SpreadElement', argument: { type: 'ObjectExpression', properties: [] } }, 'noDynamicSpread'],
		] as const) {
			const node = argument.type === 'Property'
				? { type: 'ObjectExpression', properties: [argument] }
				: argument
			expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [node]))[0]?.messageId)
				.toBe(messageId)
		}
	})

	it('preserves value-aware short-circuit and operator diagnostics', () => {
		const literal = (value: unknown) => ({ type: 'Literal', value })
		for (const argument of [
			{ type: 'LogicalExpression', operator: '&&', left: literal(false), right: { type: 'Identifier', name: 'dynamic' } },
			{ type: 'LogicalExpression', operator: '||', left: literal(true), right: { type: 'Identifier', name: 'dynamic' } },
			{ type: 'ConditionalExpression', test: literal(true), consequent: literal('ok'), alternate: { type: 'Identifier', name: 'dynamic' } },
		]) {
			expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [argument])))
				.toEqual([])
		}

		for (const argument of [
			{ type: 'BinaryExpression', operator: '+', left: literal(null), right: literal(null) },
			{ type: 'TemplateLiteral', expressions: [literal({})], quasis: [{ value: { cooked: '' } }, { value: { cooked: '' } }] },
			{ type: 'UnaryExpression', operator: '~', argument: literal(1) },
		]) {
			expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [argument]))[0]?.messageId)
				.toBe('noDynamicArg')
		}
	})

	it('honors declaration shadowing while retaining ambient globals', () => {
		const shadowed = { variables: [{ name: 'pika', defs: [{}] }], upper: null }
		expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [{ type: 'Identifier', name: 'dynamic' }]), shadowed))
			.toEqual([])

		const ambient = { variables: [{ name: 'pika', defs: [] }], upper: null }
		expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [{ type: 'Identifier', name: 'dynamic' }]), ambient))
			.toHaveLength(1)

		const globalConstant = { variables: [{ name: 'undefined', defs: [] }], upper: null }
		expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [{ type: 'Identifier', name: 'undefined' }]), globalConstant))
			.toEqual([])
		const localConstant = { variables: [{ name: 'undefined', defs: [{}] }], upper: null }
		expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [{ type: 'Identifier', name: 'undefined' }]), localConstant))
			.toHaveLength(1)
	})

	it('handles malformed evaluator nodes and reserved member calls', () => {
		const malformed = { type: 'TSNonNullExpression', expression: undefined }
		expect(runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [malformed]))[0])
			.toMatchObject({ messageId: 'noDynamicArg', node: malformed })
		expect(runSyntheticRule(createCallExpression({
			type: 'MemberExpression',
			computed: false,
			object: { type: 'Identifier', name: 'pika' },
			property: { type: 'Identifier', name: 'str' },
		}, [{ type: 'Literal', value: 'x' }])))
			.toEqual([
				expect.objectContaining({ messageId: 'invalidPikaSyntax' }),
			])
	})

	it('covers the remaining evaluator positions and spread-shape checks', () => {
		const dynamicCall = (argument: any) => runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [argument]))
		expect(dynamicCall({ type: 'ArrayExpression', elements: [{ type: 'Identifier', name: 'value' }] })[0]?.messageId)
			.toBe('noDynamicArg')
		expect(dynamicCall({ type: 'SpreadElement', argument: { type: 'ObjectExpression', properties: [] } })[0]?.messageId)
			.toBe('noDynamicSpread')
		expect(dynamicCall({ type: 'SpreadElement', argument: { type: 'Identifier', name: 'value' } })[0]?.messageId)
			.toBe('noDynamicSpread')
		expect(dynamicCall({
			type: 'ObjectExpression',
			properties: [{ type: 'ObjectMethod' }],
		})[0]?.messageId)
			.toBe('noDynamicProperty')
		expect(dynamicCall({
			type: 'ObjectExpression',
			properties: [{ type: 'Property', computed: false, key: { type: 'UnknownKey' }, value: { type: 'Literal', value: 1 } }],
		})[0]?.messageId)
			.toBe('noDynamicProperty')
		expect(dynamicCall({
			type: 'ObjectExpression',
			properties: [{ type: 'Property', computed: true, key: { type: 'Literal', value: null }, value: { type: 'Literal', value: 1 } }],
		})[0]?.messageId)
			.toBe('noDynamicComputedKey')
		expect(dynamicCall({
			type: 'ObjectExpression',
			properties: [{ type: 'Property', computed: false, key: { type: 'Identifier', name: 'x' } }],
		})[0]?.messageId)
			.toBe('noDynamicProperty')
	})

	it('handles transparent callee wrappers and unsupported callee shapes', () => {
		for (const wrapper of ['TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'TSInstantiationExpression', 'ParenthesizedExpression']) {
			const callee = { type: wrapper, expression: { type: 'Identifier', name: 'pika' } }
			expect(runSyntheticRule(createCallExpression(callee, [{ type: 'Literal', value: 'ok' }])))
				.toEqual([])
		}
		expect(runSyntheticRule(createCallExpression({ type: 'CallExpression' }, [{ type: 'Identifier', name: 'value' }])))
			.toEqual([])
		expect(runSyntheticRule(createCallExpression({ type: 'MemberExpression', object: { type: 'CallExpression' } }, [])))
			.toEqual([])
		expect(runSyntheticRule(createCallExpression({ type: 'ChainExpression', expression: { type: 'Identifier', name: 'pika' } }, [])))
			.toEqual([
				expect.objectContaining({ messageId: 'invalidPikaSyntax' }),
			])
	})

	it('classifies root references using parent context and recognizes write targets', () => {
		function runIdentifier(root: any): Report[] {
			const { context, reports } = createSyntheticContext()
			const visitor = rule.create(context as any) as any
			visitor.Identifier(root)
			return reports
		}

		for (const parent of [
			{ type: 'Property', key: null, value: null, computed: false },
			{ type: 'MemberExpression', property: null, computed: false },
			{ type: 'MethodDefinition', key: null, computed: false },
			{ type: 'PropertyDefinition', key: null, computed: false },
			{ type: 'AccessorProperty', key: null, computed: false },
			{ type: 'LabeledStatement' },
			{ type: 'BreakStatement' },
			{ type: 'ContinueStatement' },
			{ type: 'VariableDeclarator', id: null },
			{ type: 'FunctionDeclaration', id: null },
			{ type: 'ClassDeclaration', id: null },
			{ type: 'ImportSpecifier' },
			{ type: 'TSPropertySignature', key: null, computed: false },
		] as any[]) {
			const root: any = { type: 'Identifier', name: 'pika' }
			if (parent.type === 'Property') {
				parent.key = root
				parent.value = { type: 'Literal', value: 1 }
			}
			else if (parent.type === 'MemberExpression') {
				parent.property = root
			}
			else if (parent.type === 'VariableDeclarator' || parent.type === 'FunctionDeclaration' || parent.type === 'ClassDeclaration') {
				parent.id = root
			}
			else if (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition' || parent.type === 'AccessorProperty') {
				parent.key = root
			}
			else if (parent.type === 'TSPropertySignature') {
				parent.key = root
			}
			else {
				(parent as any).label = root
			}
			root.parent = parent
			expect(runIdentifier(root))
				.toEqual([])
		}

		for (const parent of [
			{ type: 'AssignmentExpression', left: null },
			{ type: 'UpdateExpression', argument: null },
			{ type: 'ForOfStatement', left: null },
			{ type: 'UnaryExpression', operator: 'delete', argument: null },
		] as any[]) {
			const root: any = { type: 'Identifier', name: 'pika' }
			if (parent.type === 'AssignmentExpression')
				parent.left = root
			else if (parent.type === 'UpdateExpression' || parent.type === 'UnaryExpression')
				parent.argument = root
			else
				parent.left = root
			root.parent = parent
			expect(runIdentifier(root)[0]?.messageId)
				.toBe('invalidPikaSyntax')
		}
	})

	it('recognizes nested transparent member chains and parent-based ownership', () => {
		for (const wrapper of ['TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'TSInstantiationExpression', 'ParenthesizedExpression']) {
			const root: any = { type: 'Identifier', name: 'pika' }
			const wrapperNode: any = { type: wrapper, expression: root }
			const member: any = { type: 'MemberExpression', object: wrapperNode, computed: false, property: { type: 'Identifier', name: 'theme' } }
			root.parent = wrapperNode
			wrapperNode.parent = member
			expect((() => {
				const { context, reports } = createSyntheticContext()
				const visitor = rule.create(context as any) as any
				visitor.Identifier(root)
				return reports
			})())
				.toEqual([
					expect.objectContaining({ messageId: 'invalidPikaSyntax' }),
				])
		}
	})

	it('keeps direct utility callee semantics independent of project configuration', () => {
		expect(getCalleeRootName({ callee: { type: 'Identifier', name: 'pika' } }))
			.toBe('pika')
		expect(getCalleeRootName({ callee: { type: 'MemberExpression', object: { type: 'Identifier', name: 'pika' } } }))
			.toBe('pika')
		expect(getCalleeRootName({ callee: { type: 'ChainExpression', expression: { type: 'Identifier', name: 'pika' } } }))
			.toBe('pika')
		expect(getCalleeRootName({ callee: { type: 'UnknownExpression' } }))
			.toBeNull()
		expect(getCalleeName({ callee: { type: 'Identifier', name: 'pika' } }))
			.toBe('pika')
		expect(getCalleeName({ callee: { type: 'MemberExpression', computed: false, object: { type: 'Identifier', name: 'pika' }, property: { type: 'Identifier', name: 'theme' } } }))
			.toBe('pika.theme')
		expect(getCalleeName({ callee: { type: 'MemberExpression', computed: true, object: { type: 'Identifier', name: 'pika' }, property: { type: 'Literal', value: 'theme' } } }))
			.toBe('pika.theme')
		expect(getCalleeName({ optional: true, callee: { type: 'Identifier', name: 'pika' } }))
			.toBeNull()
		expect(getCalleeName({ callee: { type: 'MemberExpression', optional: true, object: { type: 'Identifier', name: 'pika' }, property: { type: 'Identifier', name: 'theme' } } }))
			.toBeNull()
		expect(getCalleeName({ callee: { type: 'MemberExpression', object: { type: 'CallExpression' }, property: { type: 'Identifier', name: 'theme' } } }))
			.toBeNull()
	})

	it('keeps diagnostic reason mapping for evaluator failures', () => {
		for (const node of [
			{ type: 'Identifier', name: 'value' },
			{ type: 'CallExpression' },
			{ type: 'TemplateLiteral' },
			{ type: 'ConditionalExpression' },
			{ type: 'UnaryExpression', operator: '~' },
			{ type: 'BinaryExpression', operator: '%' },
			{ type: 'LogicalExpression', operator: '&' },
			{ type: 'MemberExpression' },
			{ type: 'TaggedTemplateExpression' },
			{ type: 'NewExpression' },
			{ type: 'AwaitExpression' },
			{ type: 'YieldExpression' },
			{ type: 'AssignmentExpression' },
			{ type: 'SequenceExpression' },
			{ type: 'UnknownExpression' },
		]) {
			expect(getDynamicReason(node))
				.toEqual(expect.any(String))
		}
		expect(evaluateStatic({ type: 'Identifier', name: 'value' }, undefined).ok)
			.toBe(false)
	})

	it('covers malformed evaluator positions, static shape failures, and sparse recursion', () => {
		const literal = (value: unknown) => ({ type: 'Literal', value })
		const dynamic = { type: 'Identifier', name: 'dynamic' }
		const call = (argument: any) => runSyntheticRule(createCallExpression({ type: 'Identifier', name: 'pika' }, [argument]))

		expect(call({ type: 'TemplateLiteral', expressions: [], quasis: [{ value: { cooked: null } }] })[0]?.messageId)
			.toBe('noDynamicArg')
		for (const argument of [
			{ type: 'BinaryExpression', operator: '+', left: dynamic, right: literal(1) },
			{ type: 'BinaryExpression', operator: '+', left: literal(1), right: dynamic },
			{ type: 'LogicalExpression', operator: '&&', left: dynamic, right: literal(1) },
			{ type: 'LogicalExpression', operator: '~>', left: literal(1), right: literal(2) },
		]) {
			expect(call(argument)[0]?.messageId)
				.toBe('noDynamicArg')
		}

		expect(call({
			type: 'ObjectExpression',
			properties: [{ type: 'Property', computed: false, key: literal(true), value: literal(1) }],
		})[0]?.messageId)
			.toBe('noDynamicProperty')
		expect(call({
			type: 'ObjectExpression',
			properties: [{ type: 'SpreadElement', argument: dynamic }],
		})[0]?.messageId)
			.toBe('noDynamicSpread')
		for (const spreadValue of [[], null, 1]) {
			expect(call({
				type: 'ObjectExpression',
				properties: [{ type: 'SpreadElement', argument: literal(spreadValue) }],
			})[0]?.messageId)
				.toBe('noDynamicSpread')
		}

		const sparseArray = call({ type: 'ArrayExpression', elements: [null, dynamic, literal('static')] })
		expect(sparseArray.map(report => report.messageId))
			.toEqual(['noDynamicArg'])
		for (const nested of [
			{ type: 'ArrayExpression', elements: [dynamic] },
			{ type: 'ObjectExpression', properties: [{ type: 'Property', computed: false, key: { type: 'Identifier', name: 'value' }, value: dynamic }] },
		]) {
			expect(call({ type: 'ArrayExpression', elements: [nested] })[0]?.messageId)
				.toBe(nested.type === 'ArrayExpression' ? 'noDynamicArg' : 'noDynamicProperty')
		}
		for (const spreadValue of [{}, null]) {
			expect(call({ type: 'ArrayExpression', elements: [{ type: 'SpreadElement', argument: literal(spreadValue) }] })[0]?.messageId)
				.toBe('noDynamicSpread')
		}
		for (const spreadValue of [{}, null]) {
			expect(call({ type: 'SpreadElement', argument: literal(spreadValue) })[0]?.messageId)
				.toBe('noDynamicSpread')
		}

		expect(runSyntheticRule({ type: 'CallExpression', callee: { type: 'Identifier', name: 'pika' } }))
			.toEqual([])
		expect(runSyntheticRule({ type: 'CallExpression', callee: null, arguments: [] }))
			.toEqual([])
	})

	it('covers reference write-pattern walks and transparent member-chain climbing', () => {
		function runIdentifier(root: any): Report[] {
			const { context, reports } = createSyntheticContext()
			const visitor = rule.create(context as any) as any
			visitor.Identifier(root)
			return reports
		}

		expect(runIdentifier({ type: 'Identifier', name: 'pika' })[0]?.messageId)
			.toBe('invalidPikaSyntax')
		for (const patternType of ['ArrayPattern', 'ObjectPattern', 'RestElement']) {
			const root: any = { type: 'Identifier', name: 'pika' }
			const pattern: any = patternType === 'RestElement'
				? { type: patternType, argument: root }
				: patternType === 'ArrayPattern' ? { type: patternType, elements: [root] } : { type: patternType, properties: [root] }
			root.parent = pattern
			expect(runIdentifier(root))
				.toEqual([])
		}
		{
			const root: any = { type: 'Identifier', name: 'pika' }
			const pattern: any = { type: 'AssignmentPattern', left: root }
			root.parent = pattern
			expect(runIdentifier(root))
				.toEqual([])
		}
		{
			const root: any = { type: 'Identifier', name: 'pika' }
			const property: any = { type: 'Property', computed: false, key: { type: 'Identifier', name: 'value' }, value: root }
			const pattern: any = { type: 'ObjectPattern', elements: [property] }
			root.parent = property
			property.parent = pattern
			expect(runIdentifier(root))
				.toEqual([])
		}

		for (const wrapper of ['TSAsExpression', 'ParenthesizedExpression']) {
			const root: any = { type: 'Identifier', name: 'pika' }
			const firstMember: any = { type: 'MemberExpression', object: root, property: { type: 'Identifier', name: 'one' }, computed: false }
			const transparent: any = { type: wrapper, expression: firstMember }
			const lastMember: any = { type: 'MemberExpression', object: transparent, property: { type: 'Identifier', name: 'two' }, computed: false }
			root.parent = firstMember
			firstMember.parent = transparent
			transparent.parent = lastMember
			expect(runIdentifier(root))
				.toEqual([
					expect.objectContaining({ messageId: 'invalidPikaSyntax' }),
				])
		}
	})

	it('covers same-root nesting and dependency ownership across physical entries', () => {
		expect(lintWithRule(rule, 'pika(pika({ color: "red" }))', '/test/nested.ts'))
			.toEqual([
				expect.objectContaining({ messageId: 'invalidPikaSyntax' }),
			])
		expect(lintWithRule(rule, 'pika({ nested: { value: pika({}) } })', '/test/deep.ts'))
			.toEqual([
				expect.objectContaining({ messageId: 'invalidPikaSyntax' }),
			])

		const entry = testModel.entries[0]!
		const splitModel: LintProjectModel = {
			...testModel,
			roots: ['pika', 'css'],
			entries: [
				{ ...entry, index: 0, fnName: 'pika', matcher: { matches: filename => filename.endsWith('/pika.ts') } },
				{ ...entry, index: 1, fnName: 'css', cssModule: 'css.css', matcher: { matches: () => false } },
			],
		}
		const splitRule = createStaticUsageRule(splitModel)
		const messages = lintWithRule(splitRule, 'pika(css({ color: "red" }))', '/test/pika.ts')
		expect(messages.map(message => message.messageId))
			.toEqual(['outsideScan', 'crossEntryDependency'])
	})

	it('deduplicates repeated outside-scan diagnostics and keeps configured rule ownership separate from ESLint files', () => {
		const entry = testModel.entries[0]!
		const outsideRule = createStaticUsageRule({
			...testModel,
			entries: [{ ...entry, matcher: { matches: () => false } }],
		})
		const messages = lintWithRule(outsideRule, 'pika(); pika; pika;', '/test/outside.ts')
		expect(messages.filter(message => message.messageId === 'outsideScan'))
			.toHaveLength(3)
		expect(messages.filter(message => message.messageId === 'invalidPikaSyntax'))
			.toHaveLength(2)
	})

	it('covers the remaining callee-shape utility branches', () => {
		expect(getCalleeRootName({ callee: { type: 'MemberExpression', object: { type: 'ChainExpression', expression: { type: 'Identifier', name: 'pika' } } } }))
			.toBe('pika')
		expect(getCalleeName({ callee: { type: 'UnknownExpression' } }))
			.toBeNull()
		expect(getCalleeName({ callee: { type: 'MemberExpression', computed: true, object: { type: 'Identifier', name: 'pika' }, property: { type: 'Literal', value: 1 } } }))
			.toBeNull()
	})
})
