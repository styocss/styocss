import type { Engine } from '@pikacss/core'
import type { FnConfig } from './fnConfig'
import type { AnalyzedModule, FrameworkProcessor, MacroCall } from './processors/types'
import { createEngine, defineEnginePlugin } from '@pikacss/core'
import { describe, expect, it, vi } from 'vitest'
import { PikaTransformError } from './compiler/errors'
import { parseJsExpression } from './compiler/parse'
import { analyzeModule, analyzeProjectModule, commitModule, hashSource, isSameUsageList, prepareModule, recommitModule, rewriteModule } from './ctx.pipeline'
import { createFnConfig } from './fnConfig'
import { parseModuleId } from './moduleId'
import { createDefaultProcessorRegistry, createProcessorRegistry } from './processors/registry'

const fnConfig = createFnConfig('pika')

function makeCall(overrides: Partial<MacroCall> & { argSources?: string[] } = {}): MacroCall {
	const { argSources = ['\'bg:red\''], ...rest } = overrides
	return {
		start: 0,
		end: 10,
		loc: { line: 1, column: 0 },
		arguments: argSources.map(source => parseJsExpression(source, 'ts')) as MacroCall['arguments'],
		lexical: { shadowedGlobals: new Set() },
		quote: '\'',
		...rest,
	}
}

// Mocked split-phase engine (#114): `prepareUse` resolves an opaque plan (here
// simply the final name list) and the sync `commitUse` turns a plan into names.
function makeEngine(prepareImpl?: (...args: any[]) => Promise<string[]>): Engine {
	return {
		pika: {
			hasStatic: vi.fn(() => false),
			getStatic: vi.fn(() => undefined),
		},
		prepareUse: vi.fn(prepareImpl ?? (async (...args: any[]) => args.map((_, i) => `pk-${i}`))),
		commitUse: vi.fn((plan: string[]) => plan),
	} as unknown as Engine
}

describe('hashSource', () => {
	it('is stable for identical input and differs for different input', () => {
		expect(hashSource('abc'))
			.toBe(hashSource('abc'))
		expect(hashSource('abc'))
			.not.toBe(hashSource('abd'))
	})
})

describe('isSameUsageList', () => {
	it('compares by serialized content and handles missing previous', () => {
		expect(isSameUsageList(undefined, []))
			.toBe(true)
		expect(isSameUsageList([{ atomicStyleIds: ['a'] }], [{ atomicStyleIds: ['a'] }]))
			.toBe(true)
		expect(isSameUsageList([{ atomicStyleIds: ['a'] }], []))
			.toBe(false)
		expect(isSameUsageList([{ atomicStyleIds: ['a'] }], [{ atomicStyleIds: ['b'] }]))
			.toBe(false)
	})

	it('treats serialization failures as changed', () => {
		expect(isSameUsageList(
			[{ atomicStyleIds: [1n] as any }],
			[{ atomicStyleIds: [2n] as any }],
		))
			.toBe(false)
	})
})

describe('analyzeModule', () => {
	const registry = createDefaultProcessorRegistry()

	it('fast-filters by extension and fn-name substring', async () => {
		expect(await analyzeModule('pika(\'a\')', parseModuleId('/m.svelte', '/'), { registry, fnConfig }))
			.toBeNull()
		expect(await analyzeModule('const a = 1', parseModuleId('/m.ts', '/'), { registry, fnConfig }))
			.toBeNull()
	})

	it('dispatches to the processor on a filter hit', async () => {
		const analyzed = await analyzeModule('pika(\'a\')', parseModuleId('/m.ts', '/'), { registry, fnConfig })
		expect(analyzed?.calls)
			.toHaveLength(1)
		expect(analyzed?.calls[0]!.arguments[0]?.type)
			.toBe('StringLiteral')
	})

	it('lets substring-only hits through the fast filter without inventing calls', async () => {
		// The fast filter is a substring check, never a correctness check: code
		// containing the base name inside another identifier (or a string) must
		// reach the AST pass and resolve to zero macro calls, not crash or match.
		expect((await analyzeModule('pikaFoo(\'a\')', parseModuleId('/m.ts', '/'), { registry, fnConfig }))?.calls)
			.toEqual([])
		expect((await analyzeModule('const label = \'my pika string\'', parseModuleId('/m.ts', '/'), { registry, fnConfig }))?.calls)
			.toEqual([])
	})
})

describe('analyzeProjectModule', () => {
	it('uses one project analyzer call for several roots when the processor supports it', async () => {
		const registry = createProcessorRegistry()
		const analyze = vi.fn()
		const analyzeProject = vi.fn((code: string, id: string, options: { fnNames: readonly string[] }) => ({
			id,
			code,
			modules: new Map(options.fnNames.map(fnName => [fnName, { fnName, id, code, calls: [] }])),
		}))
		const processor: FrameworkProcessor = { name: 'project-aware', analyze, analyzeProject }
		registry.register(['ts'], () => Promise.resolve(processor))

		const result = await analyzeProjectModule(
			`const a = pika({ color: 'red' }); const b = admin({ display: 'flex' })`,
			parseModuleId('/m.ts', '/'),
			{ registry, fnNames: ['pika', 'admin'] },
		)

		expect(result?.modules.size)
			.toBe(2)
		expect(analyzeProject)
			.toHaveBeenCalledTimes(1)
		expect(analyze)
			.not.toHaveBeenCalled()
	})

	it('falls back to the legacy analyzer for processors without a project analyzer', async () => {
		const registry = createProcessorRegistry()
		const analyze = vi.fn((code: string, id: string, options: { fnConfig: FnConfig }) => ({
			fnName: options.fnConfig.fnName,
			id,
			code,
			calls: [],
		}))
		registry.register(['custom'], () => Promise.resolve({ name: 'legacy', analyze }))

		const result = await analyzeProjectModule(
			'pika admin',
			parseModuleId('/m.custom', '/'),
			{ registry, fnNames: ['pika', 'admin'] },
		)

		expect(result?.modules.size)
			.toBe(2)
		expect(analyze)
			.toHaveBeenCalledTimes(2)
	})
})

describe('prepareModule', () => {
	it('prepares calls sequentially in list order without committing anything', async () => {
		const order: string[] = []
		const engine = makeEngine(async (...args: any[]) => {
			order.push(args[0])
			return [`pk-${args[0]}`]
		})
		const analyzed: AnalyzedModule = {
			fnName: 'pika',
			id: '/m.ts',
			code: 'pika(\'a\'); pika(\'b\')',
			calls: [
				makeCall({ start: 0, end: 9, argSources: ['\'a\''] }),
				makeCall({ start: 11, end: 20, argSources: ['\'b\''], quote: '"' }),
			],
		}
		const prepared = await prepareModule(analyzed, { engine, transformedFormat: 'string' })

		expect(order)
			.toEqual(['a', 'b'])
		// Provisional only: no commit happened during preparation (#114).
		expect(engine.commitUse)
			.not.toHaveBeenCalled()
		expect(prepared.preparedCalls)
			.toEqual([
				{ plan: ['pk-a'], start: 0, end: 9, format: 'string', quote: '\'' },
				{ plan: ['pk-b'], start: 11, end: 20, format: 'string', quote: '"' },
			])
		expect(prepared.sourceHash)
			.toBe(hashSource(analyzed.code))
	})

	it('performs bounded static evaluation only during prepare and reports positioned prepare-stage failures', async () => {
		const registry = createDefaultProcessorRegistry()
		const analyzed = await analyzeModule(
			'pika({ color: theme })',
			parseModuleId('/m.ts', '/'),
			{ registry, fnConfig },
		)
		expect(analyzed)
			.not.toBeNull()
		const engine = makeEngine()
		try {
			await prepareModule(analyzed!, { engine, transformedFormat: 'string' })
			expect.unreachable()
		}
		catch (error: any) {
			expect(error)
				.toBeInstanceOf(PikaTransformError)
			expect(error.stage)
				.toBe('prepare')
			expect(error.loc)
				.toEqual({ line: 1, column: 14 })
		}
		expect(engine.prepareUse)
			.not.toHaveBeenCalled()
		expect(engine.commitUse)
			.not.toHaveBeenCalled()
	})

	it('resolves initialized Pika static extensions during prepare without committing', async () => {
		const registry = createDefaultProcessorRegistry()
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'pipeline-static-theme',
				configureEngine(configurator) {
					configurator.pika.extendStatic('theme', {
						colors: { primary: 'red' },
					})
				},
			})],
		})
		const prepareUse = vi.spyOn(engine, 'prepareUse')
		const commitUse = vi.spyOn(engine, 'commitUse')
		const analyzed = await analyzeModule(
			'pika({ color: pika.theme.colors.primary })',
			parseModuleId('/m.ts', '/'),
			{ registry, fnConfig },
		)

		const prepared = await prepareModule(analyzed!, { engine, transformedFormat: 'string' })

		expect(prepareUse)
			.toHaveBeenCalledWith({ color: 'red' })
		expect(commitUse)
			.not.toHaveBeenCalled()
		expect(prepared.preparedCalls)
			.toHaveLength(1)
	})

	it('prepares a static-extension value through the Vue processor without host-specific evaluation', async () => {
		const registry = createDefaultProcessorRegistry()
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'pipeline-vue-static-theme',
				configureEngine(configurator) {
					configurator.pika.extendStatic('theme', { colors: { primary: 'red' } })
				},
			})],
		})
		const prepareUse = vi.spyOn(engine, 'prepareUse')
		const source = '<template>\n  <div :class="pika({ color: pika.theme.colors.primary })" />\n</template>\n'
		const analyzed = await analyzeModule(source, parseModuleId('/App.vue', '/'), { registry, fnConfig })

		expect(analyzed?.calls)
			.toHaveLength(1)
		await prepareModule(analyzed!, { engine, transformedFormat: 'string' })
		expect(prepareUse)
			.toHaveBeenCalledWith({ color: 'red' })
	})

	it('surfaces terminal materialization failures as positioned prepare-stage errors', async () => {
		const registry = createDefaultProcessorRegistry()
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'pipeline-invalid-static-terminal',
				configureEngine(configurator) {
					configurator.pika.extendStatic('bad', { value: () => 1 })
				},
			})],
		})
		const analyzed = await analyzeModule(
			'pika({ color: pika.bad })',
			parseModuleId('/bad.ts', '/'),
			{ registry, fnConfig },
		)

		try {
			await prepareModule(analyzed!, { engine, transformedFormat: 'string' })
			expect.unreachable()
		}
		catch (error: any) {
			expect(error)
				.toBeInstanceOf(PikaTransformError)
			expect(error.stage)
				.toBe('prepare')
			expect(error.loc)
				.toEqual({ line: 1, column: 14 })
			expect(error.message)
				.toContain('static-extension terminal contains a function')
		}
	})

	it('evaluates computed static-extension member keys during prepare', async () => {
		const registry = createDefaultProcessorRegistry()
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'pipeline-static-computed-key',
				configureEngine(configurator) {
					configurator.pika.extendStatic('keys', { theme: 'theme' })
					configurator.pika.extendStatic('theme', { colors: { primary: 'red' } })
				},
			})],
		})
		const prepareUse = vi.spyOn(engine, 'prepareUse')
		const analyzed = await analyzeModule(
			'pika({ color: pika[\'the\' + \'me\'].colors.primary })',
			parseModuleId('/computed.ts', '/'),
			{ registry, fnConfig },
		)

		await prepareModule(analyzed!, { engine, transformedFormat: 'string' })
		expect(prepareUse)
			.toHaveBeenCalledWith({ color: 'red' })

		for (const source of [
			'pika({ color: pika[root].colors.primary })',
			'pika({ color: pika[null].colors.primary })',
		]) {
			const invalid = await analyzeModule(source, parseModuleId('/invalid-key.ts', '/'), { registry, fnConfig })
			await expect(prepareModule(invalid!, { engine, transformedFormat: 'string' }))
				.rejects.toMatchObject({ stage: 'prepare' })
		}

		const nested = await analyzeModule(
			'pika({ color: pika[pika.keys.theme].colors.primary })',
			parseModuleId('/nested-key.ts', '/'),
			{ registry, fnConfig },
		)
		await prepareModule(nested!, { engine, transformedFormat: 'string' })
		expect(prepareUse)
			.toHaveBeenLastCalledWith({ color: 'red' })
	})

	it('preserves evaluator short-circuiting around static extensions and fails unknown taken roots in prepare', async () => {
		const registry = createDefaultProcessorRegistry()
		const engine = await createEngine()
		const prepareUse = vi.spyOn(engine, 'prepareUse')
		const commitUse = vi.spyOn(engine, 'commitUse')
		const dead = await analyzeModule(
			'pika({ color: false ? pika.missing.value : \'red\' })',
			parseModuleId('/dead.ts', '/'),
			{ registry, fnConfig },
		)

		await expect(prepareModule(dead!, { engine, transformedFormat: 'string' }))
			.resolves.toMatchObject({ preparedCalls: [{ format: 'string' }] })
		expect(prepareUse)
			.toHaveBeenLastCalledWith({ color: 'red' })
		expect(commitUse)
			.not.toHaveBeenCalled()

		prepareUse.mockClear()
		const taken = await analyzeModule(
			'pika({ color: true ? pika.missing.value : \'red\' })',
			parseModuleId('/taken.ts', '/'),
			{ registry, fnConfig },
		)
		try {
			await prepareModule(taken!, { engine, transformedFormat: 'string' })
			expect.unreachable()
		}
		catch (error: any) {
			expect(error)
				.toBeInstanceOf(PikaTransformError)
			expect(error.stage)
				.toBe('prepare')
			expect(error.message)
				.toContain('unknown Pika static-extension root "missing"')
		}
		expect(prepareUse)
			.not.toHaveBeenCalled()
		expect(commitUse)
			.not.toHaveBeenCalled()
	})

	it('uses the configured custom root name in prepare-stage diagnostics', async () => {
		const customFnConfig = createFnConfig('css')
		const registry = createDefaultProcessorRegistry()
		const engine = await createEngine()
		const analyzed = await analyzeModule(
			'css({ color: css.missing.primary })',
			parseModuleId('/custom.ts', '/'),
			{ registry, fnConfig: customFnConfig },
		)

		await expect(prepareModule(analyzed!, { engine, transformedFormat: 'string' }))
			.rejects.toThrow('Failed to statically evaluate css() argument')
	})

	it('wraps engine failures in a positioned PikaTransformError and commits nothing', async () => {
		const engine = makeEngine(async () => {
			throw new Error('engine boom')
		})
		const analyzed: AnalyzedModule = {
			fnName: 'pika',
			id: '/m.ts',
			code: 'x',
			calls: [makeCall({ loc: { line: 3, column: 4 } })],
		}
		try {
			await prepareModule(analyzed, { engine, transformedFormat: 'string' })
			expect.unreachable()
		}
		catch (error: any) {
			expect(error)
				.toBeInstanceOf(PikaTransformError)
			expect(error.stage)
				.toBe('prepare')
			expect(error.loc)
				.toEqual({ line: 3, column: 4 })
			expect(error.message)
				.toContain('engine boom')
		}
		expect(engine.commitUse)
			.not.toHaveBeenCalled()
	})

	it('never reaches the engine for calls after the first failing one', async () => {
		const engine = makeEngine(async (...args: any[]) => {
			if (args[0] === 'boom')
				throw new Error('later call fails')
			return [`pk-${args[0]}`]
		})
		const analyzed: AnalyzedModule = {
			fnName: 'pika',
			id: '/m.ts',
			code: 'pika(\'a\'); pika(\'boom\'); pika(\'c\')',
			calls: [
				makeCall({ start: 0, end: 9, argSources: ['\'a\''] }),
				makeCall({ start: 11, end: 23, argSources: ['\'boom\''] }),
				makeCall({ start: 25, end: 34, argSources: ['\'c\''] }),
			],
		}
		await expect(prepareModule(analyzed, { engine, transformedFormat: 'string' }))
			.rejects.toThrow('later call fails')
		expect(engine.prepareUse)
			.toHaveBeenCalledTimes(2)
		expect(engine.commitUse)
			.not.toHaveBeenCalled()
	})
})

describe('commitModule', () => {
	function makeDeps(engine: Engine) {
		return {
			engine,
			usages: new Map(),
			triggerStyleUpdated: vi.fn(),
		}
	}

	it('commits every prepared call in order and builds replacements + usage lists', async () => {
		const engine = makeEngine(async (...args: any[]) => [`pk-${args[0]}`])
		const analyzed: AnalyzedModule = {
			fnName: 'pika',
			id: '/m.ts',
			code: 'pika(\'a\'); pika(\'b\')',
			calls: [
				makeCall({ start: 0, end: 9, argSources: ['\'a\''] }),
				makeCall({ start: 11, end: 20, argSources: ['\'b\''], quote: '"' }),
			],
		}
		const prepared = await prepareModule(analyzed, { engine, transformedFormat: 'string' })
		const deps = makeDeps(engine)
		const committed = commitModule(prepared, deps)

		expect(engine.commitUse)
			.toHaveBeenNthCalledWith(1, ['pk-a'])
		expect(engine.commitUse)
			.toHaveBeenNthCalledWith(2, ['pk-b'])
		expect(committed.replacements)
			.toEqual([
				{ start: 0, end: 9, content: '\'pk-a\'' },
				{ start: 11, end: 20, content: '"pk-b"' },
			])
		expect(committed.usageList)
			.toEqual([
				{ atomicStyleIds: ['pk-a'] },
				{ atomicStyleIds: ['pk-b'] },
			])
		expect(committed.sourceHash)
			.toBe(prepared.sourceHash)
		expect(deps.usages.get('/m.ts'))
			.toEqual(committed.usageList)
		expect(deps.triggerStyleUpdated)
			.toHaveBeenCalledTimes(1)
	})

	it('serializes committed names per prepared format and escapes quotes', async () => {
		const engine = makeEngine(async () => ['it\'s', 'b'])
		const analyzed: AnalyzedModule = {
			fnName: 'pika',
			id: '/m.ts',
			code: 'x',
			calls: [makeCall({})],
		}
		const asArray = commitModule(
			await prepareModule(analyzed, { engine, transformedFormat: 'array' }),
			makeDeps(engine),
		)
		expect(asArray.replacements[0]!.content)
			.toBe('[\'it\\\'s\', \'b\']')
		const asString = commitModule(
			await prepareModule(analyzed, { engine, transformedFormat: 'string' }),
			makeDeps(engine),
		)
		expect(asString.replacements[0]!.content)
			.toBe('\'it\\\'s b\'')
	})
})

describe('recommitModule', () => {
	function makeDeps() {
		return {
			usages: new Map(),
			triggerStyleUpdated: vi.fn(),
		}
	}
	const usage = { atomicStyleIds: ['pk-a'] }

	it('commits usages and fires triggers on first commit', () => {
		const deps = makeDeps()
		recommitModule({ id: '/m.ts', sourceHash: 'h', replacements: [], usageList: [usage] }, deps)
		expect(deps.usages.get('/m.ts'))
			.toEqual([usage])
		expect(deps.triggerStyleUpdated)
			.toHaveBeenCalledTimes(1)
	})

	it('skips triggers when records are unchanged, fires when they differ', () => {
		const deps = makeDeps()
		const committed = { id: '/m.ts', sourceHash: 'h', replacements: [], usageList: [usage] }
		recommitModule(committed, deps)
		recommitModule(committed, deps)
		expect(deps.triggerStyleUpdated)
			.toHaveBeenCalledTimes(1)
		recommitModule({ ...committed, usageList: [{ atomicStyleIds: ['pk-b'] }] }, deps)
		expect(deps.triggerStyleUpdated)
			.toHaveBeenCalledTimes(2)
	})

	it('deletes entries on an empty usage list, triggering only when styles existed', () => {
		const deps = makeDeps()
		const empty = { id: '/m.ts', sourceHash: 'h', replacements: [], usageList: [] }
		recommitModule(empty, deps)
		expect(deps.triggerStyleUpdated)
			.not.toHaveBeenCalled()
		recommitModule({ ...empty, usageList: [usage] }, deps)
		recommitModule(empty, deps)
		expect(deps.usages.has('/m.ts'))
			.toBe(false)
		expect(deps.triggerStyleUpdated)
			.toHaveBeenCalledTimes(2)
	})
})

describe('rewriteModule', () => {
	it('removes every unshadowed reserved-root reference after a static-extension transform', async () => {
		const source = 'const cls = pika({ color: pika.theme.colors.primary })'
		const registry = createDefaultProcessorRegistry()
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'rewrite-static-theme',
				configureEngine(configurator) {
					configurator.pika.extendStatic('theme', { colors: { primary: 'red' } })
				},
			})],
		})
		const analyzed = await analyzeModule(source, parseModuleId('/m.ts', '/'), { registry, fnConfig })
		const prepared = await prepareModule(analyzed!, { engine, transformedFormat: 'string' })
		const committed = commitModule(prepared, {
			engine,
			usages: new Map(),
			triggerStyleUpdated: vi.fn(),
		})
		const rewritten = rewriteModule(source, committed).code

		expect(rewritten)
			.toMatch(/^const cls = ['"]pk-/)
		expect(rewritten)
			.not.toContain('pika')
	})

	it('applies replacements and returns a hires map', () => {
		const code = 'const a = pika(\'a\')'
		const { code: rewritten, map } = rewriteModule(code, {
			id: '/m.ts',
			sourceHash: hashSource(code),
			replacements: [{ start: 10, end: 19, content: '\'pk-a\'' }],
			usageList: [],
		})
		expect(rewritten)
			.toBe('const a = \'pk-a\'')
		expect(map.mappings.length)
			.toBeGreaterThan(0)
	})
})
