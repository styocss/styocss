import { describe, expect, it } from 'vitest'
import { createFnConfig } from '../fnConfig'
import { analyzeJs } from './analyze'
import { PikaTransformError } from './errors'

const fnConfig = createFnConfig('pika')

describe('analyzeJs', () => {
	it('returns base calls sorted by offset while retaining argument AST unevaluated', () => {
		const code = 'const a = pika({ color: theme })\nconst b = pika(\'bg:red\', \'c:white\')'
		const calls = analyzeJs(code, '/repo/src/mod.ts', 'ts', fnConfig)
		expect(calls)
			.toHaveLength(2)
		expect(code.slice(calls[0]!.start, calls[0]!.end))
			.toBe('pika({ color: theme })')
		expect(calls[0]!.arguments[0]?.type)
			.toBe('ObjectExpression')
		expect(code.slice(calls[1]!.start, calls[1]!.end))
			.toBe('pika(\'bg:red\', \'c:white\')')
		expect(calls[1]!.arguments.map(argument => argument.type))
			.toEqual(['StringLiteral', 'StringLiteral'])
		expect(calls[1]!.loc)
			.toEqual({ line: 2, column: 10 })
	})

	it('does not statically evaluate or validate general argument grammar during analyze', () => {
		const calls = analyzeJs('pika(...{ a: 1 }, { color: theme })', '/m.ts', 'ts', fnConfig)
		expect(calls)
			.toHaveLength(1)
		expect(calls[0]!.arguments.map(argument => argument.type))
			.toEqual(['SpreadElement', 'ObjectExpression'])
	})

	it('snapshots recognized-global shadowing instead of retaining Babel scope', () => {
		const shadowed = analyzeJs('function f(undefined: any) { return pika({ a: undefined }) }', '/m.ts', 'ts', fnConfig)[0]!
		expect(shadowed.lexical.shadowedGlobals)
			.toEqual(new Set(['undefined']))
		const global = analyzeJs('pika({ a: undefined, b: NaN })', '/m.ts', 'ts', fnConfig)[0]!
		expect(global.lexical.shadowedGlobals)
			.toEqual(new Set())
		expect('path' in shadowed || 'scope' in shadowed)
			.toBe(false)
	})

	it('defaults quote to single and honors an override', () => {
		expect(analyzeJs('pika(\'a\')', '/m.ts', 'ts', fnConfig)[0]!.quote)
			.toBe('\'')
		expect(analyzeJs('pika(\'a\')', '/m.ts', 'ts', fnConfig, { quote: '"' })[0]!.quote)
			.toBe('"')
	})

	it('applies offsets so ranges are absolute into a surrounding file', () => {
		const chunk = 'const a = pika(\'x\')'
		const calls = analyzeJs(chunk, '/m.vue', 'ts', fnConfig, {
			offsets: { startIndex: 50, startLine: 4, startColumn: 0 },
		})
		expect(calls[0]!.start)
			.toBe(50 + chunk.indexOf('pika'))
		expect(calls[0]!.loc.line)
			.toBe(4)
	})

	it('wraps parse failures in a positioned parse-stage error', () => {
		try {
			analyzeJs('const a = {', '/repo/src/broken.ts', 'ts', fnConfig)
			expect.unreachable()
		}
		catch (error: any) {
			expect(error)
				.toBeInstanceOf(PikaTransformError)
			expect(error.stage)
				.toBe('parse')
			expect(error.loc?.line)
				.toBe(1)
		}
	})

	it('returns an empty list for sources without base calls', () => {
		expect(analyzeJs('const a = 1', '/m.ts', 'ts', fnConfig))
			.toEqual([])
	})
})
