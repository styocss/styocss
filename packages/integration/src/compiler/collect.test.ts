/* eslint-disable no-template-curly-in-string */
import { describe, expect, it } from 'vitest'
import { createFnConfig } from '../fnConfig'
import { collectMacroCalls } from './collect'
import { PikaTransformError } from './errors'
import { parseJs } from './parse'

const fnConfig = createFnConfig('pika')

function collect(code: string, dialect: 'js' | 'ts' | 'tsx' = 'ts') {
	return collectMacroCalls(parseJs(code, dialect), fnConfig, { id: '/m.ts' })
		.map(call => code.slice(call.node.start!, call.node.end!))
}

function expectCollectError(code: string, message?: string) {
	try {
		collect(code)
		expect.unreachable()
	}
	catch (error: any) {
		expect(error)
			.toBeInstanceOf(PikaTransformError)
		expect(error.stage)
			.toBe('collect')
		if (message != null) {
			expect(error.message)
				.toContain(message)
		}
	}
}

describe('collectMacroCalls', () => {
	it('collects only unshadowed base transform calls', () => {
		expect(collect('pika(\'a\'); pika({ color: \'red\' })'))
			.toEqual(['pika(\'a\')', 'pika({ color: \'red\' })'])
	})

	it('unwraps transparent TS wrappers around the base callee', () => {
		expect(collect('pika!(\'a\'); (pika as any)(\'b\'); (pika satisfies unknown)(\'c\')'))
			.toEqual(['pika!(\'a\')', '(pika as any)(\'b\')', '(pika satisfies unknown)(\'c\')'])
	})

	it('accepts maximal static-extension member chains only inside base-call arguments', () => {
		expect(collect('pika({ color: pika.tk.color.primary, gap: (pika[\'space\' + \'s\'] as any)[1] })'))
			.toEqual(['pika({ color: pika.tk.color.primary, gap: (pika[\'space\' + \'s\'] as any)[1] })'])
	})

	it('retains computed member-key AST for Prepare-time bounded evaluation', () => {
		expect(collect('pika(pika[\'t\' + \'k\'][1])'))
			.toEqual(['pika(pika[\'t\' + \'k\'][1])'])
		expect(collect('pika(pika[1].value)'))
			.toEqual(['pika(pika[1].value)'])
		for (const source of [
			'pika(pika[root].value)',
			'pika(pika[null].value)',
			'pika(pika[pika.keys.theme].value)',
		]) {
			expect(collect(source))
				.toHaveLength(1)
		}
	})

	it('hard-errors on legacy/member/optional calls instead of leaving runtime pika syntax', () => {
		for (const source of [
			'pika.str(\'a\')',
			'pika[\'arr\'](\'a\')',
			'pika.other(\'a\')',
			'pika?.(\'a\')',
			'pika?.other(\'a\')',
			'pika.other?.(\'a\')',
		])
			expectCollectError(source)
	})

	it('rejects a static-extension chain passed to another call instead of a base transform', () => {
		expectCollectError('outer(pika.tk.color.primary)', 'only valid inside a base transform call argument')
	})

	it('rejects private-name static-extension access', () => {
		expectCollectError('class C { #secret; m() { return pika(pika.#secret) } }', 'dot static-extension access requires an identifier property')
	})

	it('hard-errors on standalone root/member use, construction, tagging, and writes', () => {
		for (const source of [
			'const x = pika',
			'const x = { pika }',
			'outer(pika)',
			'class X extends pika {}',
			'type T = typeof pika',
			'type T = pika',
			'const x = pika.tk.color',
			'typeof pika',
			'new pika()',
			'new pika.tk.Color()',
			'pika`x`',
			'pika.tk`x`',
			'pika = other',
			'pika.tk.color = "red"',
			'++pika.tk.count',
			'delete pika.tk.color',
		])
			expectCollectError(source)
	})

	it('rejects reserved roots in destructuring and loop write targets without flagging property keys', () => {
		for (const source of [
			'[pika] = values',
			'[...pika] = values',
			'[pika = fallback] = values',
			'({ x: pika } = source)',
			'({ pika } = source)',
			'for ([pika] of values) {}',
			'for ({ x: pika } in values) {}',
		])
			expectCollectError(source)

		expect(collect('({ pika: other } = source)'))
			.toEqual([])
	})

	it('rejects nested base calls', () => {
		expectCollectError('pika({ color: pika(\'red\') })', 'nested base transform calls are not supported')
	})

	it('ignores lexically shadowed root identifiers', () => {
		expect(collect('const pika = () => \'\'; pika(\'a\'); pika.str(\'b\')'))
			.toEqual([])
		expect(collect('function f(pika: any) { return [pika(\'a\'), pika.str(\'b\')] }'))
			.toEqual([])
		expect(collect('pika(\'a\'); function pika() {}'))
			.toEqual([])
		expect(collect('import { pika } from \'somewhere\'; pika(\'a\'); pika.other(\'b\')'))
			.toEqual([])
	})

	it('preserves outer calls when only an inner scope shadows the root', () => {
		expect(collect('pika(\'outer\'); function f() { const pika = () => \'\'; pika(\'inner\'); pika.foo(\'inner\') }'))
			.toEqual(['pika(\'outer\')'])
	})

	it('honors framework-provided excluded roots', () => {
		const code = 'pika(\'shadowed\'); pika.foo(\'shadowed\')'
		const calls = collectMacroCalls(parseJs(code, 'ts'), fnConfig, { id: '/m.vue', excludedRoots: new Set(['pika']) })
		expect(calls)
			.toEqual([])
	})

	it('rejects an unshadowed custom root used as a JSX component value but leaves intrinsic tags alone', () => {
		const custom = createFnConfig('Pika')
		expect(() => collectMacroCalls(parseJs('const el = <Pika />', 'tsx'), custom, { id: '/m.tsx' }))
			.toThrow('reserved root cannot be used as a JSX component value')
		expect(() => collectMacroCalls(parseJs('const el = <Pika.Foo />', 'tsx'), custom, { id: '/m.tsx' }))
			.toThrow('reserved root cannot be used as a JSX component value')
		expect(collectMacroCalls(parseJs('const Pika = () => null; const el = <Pika />', 'tsx'), custom, { id: '/m.tsx' }))
			.toEqual([])

		const lower = createFnConfig('pika')
		expect(collectMacroCalls(parseJs('const el = <pika />', 'tsx'), lower, { id: '/m.tsx' }))
			.toEqual([])
	})

	it('collects base calls inside JSX and other expressions', () => {
		expect(collect('const a = <div className={pika({ color: \'red\' })} />', 'tsx'))
			.toEqual(['pika({ color: \'red\' })'])
		expect(collect('const a = `x ${pika(\'a\')} y`'))
			.toEqual(['pika(\'a\')'])
	})

	it('never matches identifiers inside strings, comments, or non-computed property keys', () => {
		expect(collect('const a = "pika(\'x\')" // pika(\'y\')\n/* pika(\'z\') */\nconst x = { pika: 1 }; obj.pika'))
			.toEqual([])
	})
})
