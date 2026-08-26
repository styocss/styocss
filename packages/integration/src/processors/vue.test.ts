/* eslint-disable no-template-curly-in-string */
import type { MacroCall } from './types'
import { describe, expect, it } from 'vitest'
import { PikaTransformError } from '../compiler/errors'
import { createFnConfig } from '../fnConfig'
import { vueProcessor } from './vue'

const options = { fnConfig: createFnConfig('pika') }
const ID = '/repo/src/App.vue'

async function analyze(code: string) {
	return vueProcessor.analyze(code, ID, options)
}

function snippets(code: string, calls: MacroCall[]) {
	return calls.map(call => code.slice(call.start, call.end))
}

describe('vueProcessor script blocks', () => {
	it('analyzes a plain <script> block with absolute offsets', async () => {
		const code = '<script>\nconst a = pika(\'bg:red\')\n</script>\n<template>\n  <div />\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'bg:red\')'])
		expect(calls[0]!.arguments[0]?.type)
			.toBe('StringLiteral')
		expect(calls[0]!.loc.line)
			.toBe(2)
	})

	it('analyzes <script setup lang="ts"> with TS syntax', async () => {
		const code = '<script setup lang="ts">\nconst a = pika({ color: \'red\' } as const)\nconst b = <string>\'no-jsx-conflict\'\n</script>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika({ color: \'red\' } as const)'])
		expect(calls[0]!.arguments[0]?.type)
			.toBe('TSAsExpression')
	})

	it('analyzes both script and script setup blocks', async () => {
		const code = `<script>\nexport const a = pika('a')\n</script>\n<script setup>\nconst b = pika('b')\n</script>\n`
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'a\')', 'pika(\'b\')'])
	})

	it('respects JS scope shadowing inside script blocks', async () => {
		const code = '<script setup>\nconst pika = () => \'\'\nconst a = pika(\'shadowed\')\n</script>\n'
		const { calls } = await analyze(code)

		expect(calls)
			.toEqual([])
	})
})

describe('vueProcessor template expressions', () => {
	it('analyzes v-bind in double-quoted attributes with single-quote literals', async () => {
		const code = '<template>\n  <div :class="pika({ color: \'red\' })" />\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika({ color: \'red\' })'])
		expect(calls[0]!.quote)
			.toBe('\'')
	})

	it('flips to double-quote literals inside single-quoted attributes', async () => {
		const code = '<template>\n  <div :class=\'pika({ margin: "1px" })\' />\n</template>\n'
		const { calls } = await analyze(code)

		expect(calls[0]!.quote)
			.toBe('"')
	})

	it('analyzes interpolations with single-quote literals', async () => {
		const code = '<template>\n  <span>{{ pika(\'c:blue\') }}</span>\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'c:blue\')'])
		expect(calls[0]!.quote)
			.toBe('\'')
	})

	it('analyzes v-on inline handlers, including statement sequences', async () => {
		const code = '<template>\n  <button @click="doIt(); el.className = pika(\'x\')" />\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'x\')'])
	})

	it('analyzes nested ternary and template-literal expressions', async () => {
		const code = '<template>\n  <div :class="cond ? pika(\'a\') : `x ${pika(\'b\')}`" />\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'a\')', 'pika(\'b\')'])
	})

	it('analyzes expressions in v-if / v-show / v-model and custom directives', async () => {
		const code = '<template>\n  <div v-show="pika(\'a\')" v-custom="pika(\'b\')" />\n</template>\n'
		const { calls } = await analyze(code)

		expect(calls)
			.toHaveLength(2)
	})
})

describe('vueProcessor template scope shadowing', () => {
	it('excludes v-for alias shadowing within the subtree', async () => {
		const code = '<template>\n  <li v-for="pika in list">{{ pika(\'shadowed\') }}</li>\n  <div>{{ pika(\'global\') }}</div>\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'global\')'])
	})

	it('shadows aliases on the same element\'s other directives', async () => {
		const code = '<template>\n  <li v-for="(pika, i) in list" :key="pika(\'k\')" />\n</template>\n'
		const { calls } = await analyze(code)

		expect(calls)
			.toEqual([])
	})

	it('analyzes the v-for source expression in the outer scope', async () => {
		const code = '<template>\n  <li v-for="item in pika(\'x\')">{{ item }}</li>\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'x\')'])
	})

	it('excludes v-slot props shadowing within the subtree', async () => {
		const code = '<template>\n  <Comp v-slot="{ pika }">{{ pika(\'shadowed\') }}</Comp>\n  <span>{{ pika(\'kept\') }}</span>\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'kept\')'])
	})

	it('expression-internal shadowing is handled by the JS scope analysis', async () => {
		const code = '<template>\n  <button @click="(pika) => pika(\'x\')" />\n</template>\n'
		const { calls } = await analyze(code)

		expect(calls)
			.toEqual([])
	})

	it('a <script setup> const binding shadows pika in the template', async () => {
		const code = '<script setup lang="ts">\nconst pika = (value: string) => value\n</script>\n<template>\n  <div>{{ pika(\'hello\') }}</div>\n</template>\n'
		const { calls } = await analyze(code)

		expect(calls)
			.toEqual([])
	})

	it('a <script setup> function/class/import binding shadows pika in the template', async () => {
		for (const decl of [
			'function pika() { return \'\' }',
			'class pika {}',
			'import { pika } from \'./local\'',
			'const { pika } = obj',
			'const [pika] = arr',
		]) {
			const code = `<script setup>\n${decl}\n</script>\n<template>\n  <div :class="pika('x')" />\n</template>\n`
			const { calls } = await analyze(code)

			expect(snippets(code, calls))
				.toEqual([])
		}
	})

	it('an Options-API <script> return binding shadows pika in the template', async () => {
		const code = '<script>\nexport default {\n  setup() {\n    const pika = (v) => v\n    return { pika }\n  },\n}\n</script>\n<template>\n  <div :class="pika(\'x\')" />\n</template>\n'
		const { calls } = await analyze(code)

		expect(calls)
			.toEqual([])
	})

	it('keeps transforming template pika when the script does not expose it', async () => {
		const code = '<script setup>\nconst other = 1\n</script>\n<template>\n  <div :class="pika(\'kept\')" />\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'kept\')'])
	})

	it('restores the shadow when leaving the subtree (nested same-name aliases)', async () => {
		const code = '<template>\n  <ul v-for="pika in outer">\n    <li v-for="pika in inner">{{ pika(\'in\') }}</li>\n    <span>{{ pika(\'mid\') }}</span>\n  </ul>\n  <i>{{ pika(\'out\') }}</i>\n</template>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'out\')'])
	})
})

describe('vueProcessor errors and edge cases', () => {
	it('throws PikaTransformError on SFC parse errors', async () => {
		await expect(analyze('<template>\n  <div>\n</template>\n'))
			.rejects.toBeInstanceOf(PikaTransformError)
	})

	it('retains non-static template argument AST for prepare-time evaluation', async () => {
		const code = '<template>\n  <div :class="pika({ color: theme })" />\n</template>\n'
		const { calls } = await analyze(code)
		expect(calls)
			.toHaveLength(1)
		expect(calls[0]!.arguments[0]?.type)
			.toBe('ObjectExpression')
	})

	it('hard-errors on pug templates containing the fn name, skips otherwise', async () => {
		await expect(analyze('<template lang="pug">\ndiv(:class="pika(\'x\')")\n</template>\n'))
			.rejects.toThrow('lang="pug"')
		await expect(analyze('<template lang="pug">\ndiv hello\n</template>\n'))
			.resolves.toMatchObject({ calls: [] })
	})

	it('returns no calls for SFCs without pika usage', async () => {
		await expect(analyze('<template>\n  <div class="static" />\n</template>\n'))
			.resolves.toMatchObject({ calls: [] })
		await expect(analyze('<script>\nconst a = 1\n</script>\n'))
			.resolves.toMatchObject({ calls: [] })
	})

	it('surfaces compiler-sfc validation errors (style-only SFC, invalid expressions)', async () => {
		// compiler-sfc itself rejects these shapes at parse time; the processor
		// wraps them. In production the fast filter keeps pika-free files away
		// from the processor entirely.
		await expect(analyze('<style>\n.a { color: red; }\n</style>\n'))
			.rejects.toThrow('Failed to parse Vue SFC')
		await expect(analyze('<template>\n  <Comp v-slot="{ pika: }">x</Comp>\n</template>\n'))
			.rejects.toThrow('Failed to parse Vue SFC')
	})

	it('never matches pika inside template text, comments, or style blocks', async () => {
		const code = '<template>\n  <!-- pika(\'comment\') -->\n  <span>pika(\'text\')</span>\n</template>\n<style>\n/* pika(\'style\') */\n</style>\n'
		const { calls } = await analyze(code)

		expect(calls)
			.toEqual([])
	})

	it('sorts calls across blocks by absolute offset', async () => {
		const code = '<template>\n  <div :class="pika(\'t\')" />\n</template>\n<script setup>\nconst a = pika(\'s\')\n</script>\n'
		const { calls } = await analyze(code)

		expect(snippets(code, calls))
			.toEqual(['pika(\'t\')', 'pika(\'s\')'])
		expect(calls[0]!.start)
			.toBeLessThan(calls[1]!.start)
	})

	describe('v-for fallback without forParseResult', () => {
		// Simulates SFC parser versions that do not attach forParseResult:
		// re-parse the SFC, strip the field, and hand the mutated descriptor to
		// a re-imported processor through a mocked @vue/compiler-sfc.
		async function analyzeWithoutForParseResult(code: string, mutate?: (props: any[]) => void) {
			const { parse } = await import('@vue/compiler-sfc')
			const { descriptor } = parse(code, { filename: ID })
			const strip = (node: any) => {
				if (node?.props != null) {
					for (const prop of node.props) {
						if (prop.forParseResult != null)
							delete prop.forParseResult
					}
					mutate?.(node.props)
				}
				node?.children?.forEach?.(strip)
			}
			strip({ children: descriptor.template!.ast!.children })

			const { vi } = await import('vitest')
			vi.doMock('@vue/compiler-sfc', async (importOriginal) => {
				const actual = await importOriginal<typeof import('@vue/compiler-sfc')>()
				return {
					...actual,
					parse: () => ({ descriptor, errors: [] }),
				}
			})
			vi.resetModules()
			try {
				const { vueProcessor: patched } = await import('./vue')
				return await patched.analyze(code, ID, options)
			}
			finally {
				vi.doUnmock('@vue/compiler-sfc')
				vi.resetModules()
			}
		}

		it('splits the raw expression and still shadows the alias', async () => {
			const { calls } = await analyzeWithoutForParseResult(
				'<template>\n  <li v-for="(pika, i) in list">{{ pika(\'shadowed\') }}</li>\n</template>\n',
			)
			expect(calls)
				.toEqual([])
		})

		it('hard-errors when the v-for source references the fn name', async () => {
			await expect(analyzeWithoutForParseResult(
				'<template>\n  <li v-for="item in pika(\'x\')">{{ item }}</li>\n</template>\n',
			))
				.rejects.toThrow('Unsupported v-for expression')
		})

		it('throws a positioned error for alias patterns Babel cannot parse', async () => {
			await expect(analyzeWithoutForParseResult(
				'<template>\n  <li v-for="pika in list">{{ x }}</li>\n</template>\n',
				(props) => {
					for (const prop of props) {
						if (prop.name === 'for' && prop.exp != null)
							prop.exp.loc.source = 'pika] in list'
					}
				},
			))
				.rejects.toThrow('Failed to parse template binding pattern')
		})
	})
})
