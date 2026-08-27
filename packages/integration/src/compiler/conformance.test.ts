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
import { STATIC_EXTENSION_CASES } from '../../../_shared/conformance/static-extension-cases'
import { createFnConfig } from '../fnConfig'
import { analyzeJs } from './analyze'
import { PikaTransformError } from './errors'
import { evaluateCallArguments, evaluateStatic } from './evaluate'
import { parseJsExpression } from './parse'

describe('static evaluation conformance (#119)', () => {
	it.each(ALL_STATIC_EVALUATION_CASES)('$category: $name', ({ source, localBindings, expected }) => {
		const context = {
			id: '/conformance/case.ts',
			shadowedGlobals: new Set(localBindings ?? []),
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

	it.each(MACRO_SCOPE_CASES)('$name', ({ source, expected, dialect }) => {
		if (expected === 'error') {
			try {
				analyzeJs(source, '/conformance/module.ts', dialect ?? 'ts', fnConfig)
				expect.unreachable()
			}
			catch (error: any) {
				expect(error)
					.toBeInstanceOf(PikaTransformError)
				expect(error.stage)
					.toBe('collect')
			}
			return
		}

		const calls = analyzeJs(source, '/conformance/module.ts', dialect ?? 'ts', fnConfig)
		expect(calls.length > 0 ? 'inspect' : 'ignore')
			.toBe(expected)
	})
})

describe('static-extension source conformance (#152)', () => {
	const fnConfig = createFnConfig('pika')
	const prepareContext = {
		id: '/conformance/module.ts',
		stage: 'prepare' as const,
		pika: {
			fnName: 'pika',
			hasStatic: () => true,
			getStatic: () => ({}),
		},
	}

	it.each(STATIC_EXTENSION_CASES)('$name', ({ source, expected, dialect }) => {
		if (expected === 'reject') {
			try {
				const calls = analyzeJs(source, '/conformance/module.ts', dialect ?? 'ts', fnConfig)
				expect(calls)
					.toHaveLength(1)
				expect(() => evaluateCallArguments(calls[0]!.arguments, prepareContext))
					.toThrow(PikaTransformError)
			}
			catch (error: any) {
				if (!(error instanceof PikaTransformError))
					throw error
				expect(error.stage)
					.toBe('collect')
			}
			return
		}

		expect(analyzeJs(source, '/conformance/module.ts', dialect ?? 'ts', fnConfig))
			.toHaveLength(1)
	})
})
