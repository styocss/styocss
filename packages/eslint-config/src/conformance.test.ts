/**
 * #119 — ESLint-side conformance against the canonical semantics corpus in
 * `packages/_shared/conformance/`. Every parseable fixture goes through the
 * REAL ESLint parser + scope model (`Linter.verify`) into the production
 * evaluator/rule — never synthetic AST, never compared against the compiler
 * implementation (the corpus is the oracle).
 *
 * Cases marked `dialect: 'ts'` need TypeScript-only syntax that espree (the
 * parser this package's tests run) cannot represent; they are classified
 * explicitly below rather than silently skipped, and their ESTree wrapper
 * semantics stay covered by the rule's own synthetic-node unit tests.
 */
import type { Rule } from 'eslint'
import type { EvalResult } from './static-evaluate'
import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
import { MACRO_SCOPE_CASES } from '../../_shared/conformance/macro-scope-cases'
import { ALL_STATIC_EVALUATION_CASES } from '../../_shared/conformance/static-evaluation-cases'
import noDynamicArgs from './rules/no-dynamic-args'
import { evaluateStatic } from './static-evaluate'

const ESPREE_CASES = ALL_STATIC_EVALUATION_CASES.filter(item => item.dialect == null)

// Explicit classification of parser-unrepresentable fixtures (the issue's
// "document/classify" policy): everything below requires TypeScript syntax.
it('classifies exactly the TypeScript-only fixtures as espree-unrepresentable', () => {
	expect(ALL_STATIC_EVALUATION_CASES.filter(item => item.dialect === 'ts')
		.map(item => item.name))
		.toEqual([
			'as const',
			'as assertion',
			'satisfies',
			'non-null assertion',
			'nested wrappers',
			'wrapped dynamic still rejects',
		])
	expect(MACRO_SCOPE_CASES.filter(item => item.dialect === 'ts')
		.map(item => item.name))
		.toEqual([
			'type-instantiated macro call is inspected',
			'instantiation-wrapped callee is inspected',
		])
})

/**
 * Runs `source` (optionally shadowed by arrow parameters named
 * `localBindings`) through the real espree parse + scope analysis and the
 * production evaluator.
 */
function evaluateWithRealScope(source: string, localBindings: string[] = []): EvalResult {
	let result: EvalResult | undefined
	const capture: Rule.RuleModule = {
		meta: { schema: [] },
		create: context => ({
			ArrowFunctionExpression(node: any) {
				// Only the OUTER wrapper arrow is the fixture boundary; a fixture
				// that itself contains an arrow must not overwrite the capture.
				if (result === undefined)
					result = evaluateStatic(node.body, context.sourceCode.getScope(node.body))
			},
		}),
	}
	const linter = new Linter()
	const messages = linter.verify(`(${localBindings.join(', ')}) => (\n${source}\n);`, {
		plugins: { conformance: { rules: { capture } } },
		rules: { 'conformance/capture': 'error' },
		languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
	})
	const fatal = messages.find(message => message.fatal)
	if (fatal != null)
		throw new Error(`fixture failed to parse: ${fatal.message}`)
	if (result == null)
		throw new Error('fixture did not reach the capture rule')
	return result
}

describe('static evaluation conformance (#119)', () => {
	it.each(ESPREE_CASES)('$category: $name', ({ source, localBindings, expected }) => {
		const result = evaluateWithRealScope(source, localBindings ?? [])
		if (expected.kind === 'value') {
			expect(result.ok)
				.toBe(true)
			expect((result as { value: unknown }).value)
				.toEqual(expected.value)
		}
		else {
			expect(result.ok)
				.toBe(false)
		}
	})
})

describe('macro detection / scope conformance (#119)', () => {
	const espreeMacroCases = MACRO_SCOPE_CASES.filter(item => item.dialect == null)

	it.each(espreeMacroCases)('$name', ({ source, expected, eslintGlobals }) => {
		// The corpus call argument is deliberately dynamic (`dyn`): the rule
		// reports it if and only if it inspects the call.
		const linter = new Linter()
		const messages = linter.verify(source, {
			plugins: { pikacss: { rules: { 'no-dynamic-args': noDynamicArgs } } },
			rules: { 'pikacss/no-dynamic-args': 'error' },
			languageOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				globals: { dyn: 'readonly', ...eslintGlobals },
			},
		})
		const fatal = messages.find(message => message.fatal)
		expect(fatal)
			.toBeUndefined()
		const reported = messages.filter(message => message.ruleId === 'pikacss/no-dynamic-args')
		expect(reported.length > 0 ? 'inspect' : 'ignore')
			.toBe(expected)
	})
})
