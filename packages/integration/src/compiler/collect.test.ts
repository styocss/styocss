/* eslint-disable no-template-curly-in-string */
import { describe, expect, it } from 'vitest'
import { createFnConfig } from '../fnConfig'
import { collectMacroCalls } from './collect'
import { parseJs } from './parse'

const fnConfig = createFnConfig('pika')

function collect(code: string, dialect: 'js' | 'ts' | 'tsx' = 'ts') {
	return collectMacroCalls(parseJs(code, dialect), fnConfig)
		.map(call => call.variant.name)
}

describe('collectMacroCalls', () => {
	it('collects bare and member variants', () => {
		expect(collect(`
			pika('a')
			pika.str('b')
			pika.arr('c')
		`))
			.toEqual(['pika', 'pika.str', 'pika.arr'])
	})

	it('normalizes bracket-notation members to dot form', () => {
		expect(collect(`
			pika['str']('a')
			pika["arr"]('b')
			pika[\`str\`]('c')
		`))
			.toEqual(['pika.str', 'pika.arr', 'pika.str'])
	})

	it('rejects computed members with dynamic keys', () => {
		expect(collect('const key = "str"; pika[key](\'a\')'))
			.toEqual([])
		expect(collect('pika[`${"str"}`](\'a\')'))
			.toEqual([])
		expect(collect('pika[123](\'a\')'))
			.toEqual([])
	})

	it('rejects unknown members and deeper chains', () => {
		expect(collect('pika.other(\'a\')'))
			.toEqual([])
		expect(collect('pika.str.arr(\'a\')'))
			.toEqual([])
		expect(collect('obj.pika(\'a\')'))
			.toEqual([])
	})

	it('rejects optional calls and optional member calls', () => {
		expect(collect('pika?.(\'a\')'))
			.toEqual([])
		expect(collect('pika?.str(\'a\')'))
			.toEqual([])
	})

	it('unwraps TS wrapper expressions around the callee', () => {
		expect(collect('pika!(\'a\')'))
			.toEqual(['pika'])
		expect(collect('(pika as any)(\'a\')'))
			.toEqual(['pika'])
		expect(collect('(pika satisfies unknown)(\'a\')'))
			.toEqual(['pika'])
		expect(collect('(pika!).str(\'a\')'))
			.toEqual(['pika.str'])
	})

	it('ignores calls whose root is shadowed by a variable', () => {
		expect(collect('const pika = () => \'\'; pika(\'a\')'))
			.toEqual([])
		expect(collect('let pika; pika(\'a\')'))
			.toEqual([])
	})

	it('ignores calls whose root is shadowed by a parameter', () => {
		expect(collect('function f(pika: any) { return pika(\'a\') }'))
			.toEqual([])
		expect(collect('const f = (pika: any) => pika.str(\'a\')'))
			.toEqual([])
	})

	it('ignores calls shadowed by a hoisted function declaration, even before it', () => {
		expect(collect('pika(\'a\'); function pika() {}'))
			.toEqual([])
	})

	it('ignores calls whose root is shadowed by an import', () => {
		expect(collect('import { pika } from "somewhere"\npika(\'a\')'))
			.toEqual([])
		expect(collect('import pika from "somewhere"\npika(\'a\')'))
			.toEqual([])
	})

	it('ignores calls shadowed by destructuring and catch params', () => {
		expect(collect('const { pika } = obj; pika(\'a\')'))
			.toEqual([])
		expect(collect('try {}\ncatch (pika) { pika(\'a\') }'))
			.toEqual([])
	})

	it('scopes shadowing: outer calls stay macros when only an inner scope shadows', () => {
		expect(collect(`
			pika('outer')
			function f() {
				const pika = () => ''
				pika('inner')
			}
		`))
			.toEqual(['pika'])
	})

	it('collects calls inside JSX attributes and template literals', () => {
		expect(collect('const a = <div className={pika({ color: \'red\' })} />', 'tsx'))
			.toEqual(['pika'])
		expect(collect('const a = `x ${pika(\'a\')} y`'))
			.toEqual(['pika'])
	})

	it('never matches identifiers inside strings or comments (AST semantics)', () => {
		expect(collect('const a = "pika(\'x\')" // pika(\'y\')\n/* pika(\'z\') */'))
			.toEqual([])
	})

	it('collects nested macro calls as separate call sites', () => {
		expect(collect('outer(pika(\'a\'), pika.str(\'b\'))'))
			.toEqual(['pika', 'pika.str'])
	})
})
