/**
 * #119 — compiler-side conformance against the canonical semantics corpus in
 * `packages/_shared/conformance/`. Every fixture is parsed from source by the
 * REAL Babel pipeline and evaluated through the production `evaluateStatic` /
 * `analyzeJs` paths — never hand-built AST, never compared against the ESLint
 * implementation (the corpus, not either implementation, is the oracle).
 */
import { describe, expect, it } from 'vitest'
import { MACRO_SCOPE_CASES } from '../../../_shared/conformance/macro-scope-cases'
import { ALL_STATIC_EVALUATION_CASES } from '../../../_shared/conformance/static-evaluation-cases'
import { createFnConfig } from '../fnConfig'
import { analyzeJs } from './analyze'
import { PikaTransformError } from './errors'
import { evaluateStatic } from './evaluate'
import { parseJsExpression } from './parse'

describe('static evaluation conformance (#119)', () => {
	it.each(ALL_STATIC_EVALUATION_CASES)('$category: $name', ({ source, localBindings, expected }) => {
		const context = {
			id: '/conformance/case.ts',
			hasLocalBinding: (name: string) => localBindings?.includes(name) ?? false,
		}
		if (expected.kind === 'value') {
			expect(evaluateStatic(parseJsExpression(source, 'ts'), context))
				.toEqual(expected.value)
		}
		else {
			expect(() => evaluateStatic(parseJsExpression(source, 'ts'), context))
				.toThrow(PikaTransformError)
		}
	})
})

describe('macro detection / scope conformance (#119)', () => {
	const fnConfig = createFnConfig('pika')

	it.each(MACRO_SCOPE_CASES)('$name', ({ source, expected }) => {
		// The corpus call argument is deliberately dynamic (`dyn`): an
		// inspected call either surfaces as a collected macro call or as the
		// evaluator rejecting the dynamic argument; an ignored call produces
		// neither.
		let inspected: boolean
		try {
			const calls = analyzeJs(source, '/conformance/module.ts', 'ts', fnConfig)
			inspected = calls.length > 0
		}
		catch (error) {
			expect(error)
				.toBeInstanceOf(PikaTransformError)
			inspected = true
		}
		expect(inspected ? 'inspect' : 'ignore')
			.toBe(expected)
	})
})
