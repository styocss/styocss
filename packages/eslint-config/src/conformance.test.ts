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
import tsParser from '@typescript-eslint/parser'
import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
import { MACRO_SCOPE_CASES } from '../../_shared/conformance/macro-scope-cases'
import { ALL_STATIC_EVALUATION_CASES } from '../../_shared/conformance/static-evaluation-cases'
import noDynamicArgs from './rules/no-dynamic-args'
import { evaluateStatic } from './static-evaluate'

const ESPREE_CASES = ALL_STATIC_EVALUATION_CASES.filter(item => item.dialect == null)

// Every fixture — including TypeScript-only syntax — runs through the real
// TypeScript-aware ESLint parser below, so nothing is skipped. The explicit
// list still pins WHICH fixtures need that parser (a new `dialect: 'ts'`
// case fails this test until listed), keeping the classification reviewable.
it('classifies exactly the TypeScript-only fixtures as needing the TS parser', () => {
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
function evaluateWithRealScope(source: string, localBindings: string[], parser: 'espree' | 'ts'): EvalResult {
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
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			...(parser === 'ts' ? { parser: tsParser } : {}),
		},
	})
	const fatal = messages.find(message => message.fatal)
	if (fatal != null)
		throw new Error(`fixture failed to parse: ${fatal.message}`)
	if (result == null)
		throw new Error('fixture did not reach the capture rule')
	return result
}

function assertStaticExpectation(result: EvalResult, expected: (typeof ALL_STATIC_EVALUATION_CASES)[number]['expected']) {
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
}

describe('static evaluation conformance (#119)', () => {
	// The TypeScript-aware production parser path consumes EVERY canonical
	// fixture, including the TS-only ones.
	it.each(ALL_STATIC_EVALUATION_CASES)('typescript-eslint — $category: $name', ({ source, localBindings, expected }) => {
		assertStaticExpectation(evaluateWithRealScope(source, localBindings ?? [], 'ts'), expected)
	})

	// The default-espree path additionally covers every JS-parseable fixture.
	it.each(ESPREE_CASES)('espree — $category: $name', ({ source, localBindings, expected }) => {
		assertStaticExpectation(evaluateWithRealScope(source, localBindings ?? [], 'espree'), expected)
	})
})

describe('macro detection / scope conformance (#119)', () => {
	function runMacroCase(source: string, eslintGlobals: Record<string, 'readonly'> | undefined, parser: 'espree' | 'ts') {
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
				...(parser === 'ts' ? { parser: tsParser } : {}),
			},
		})
		const fatal = messages.find(message => message.fatal)
		expect(fatal)
			.toBeUndefined()
		const reported = messages.filter(message => message.ruleId === 'pikacss/no-dynamic-args')
		return reported.length > 0 ? 'inspect' : 'ignore'
	}

	it.each(MACRO_SCOPE_CASES)('typescript-eslint — $name', ({ source, expected, eslintGlobals }) => {
		expect(runMacroCase(source, eslintGlobals, 'ts'))
			.toBe(expected)
	})

	it.each(MACRO_SCOPE_CASES.filter(item => item.dialect == null))('espree — $name', ({ source, expected, eslintGlobals }) => {
		expect(runMacroCase(source, eslintGlobals, 'espree'))
			.toBe(expected)
	})
})
