import type { Engine } from '@pikacss/core'
import type { AnalyzedModule, MacroCall } from './processors/types'
import { describe, expect, it, vi } from 'vitest'
import { PikaTransformError } from './compiler/errors'
import { analyzeModule, commitModule, hashSource, isSameUsageList, prepareModule, recommitModule, rewriteModule } from './ctx.pipeline'
import { createFnConfig } from './fnConfig'
import { parseModuleId } from './moduleId'
import { createDefaultProcessorRegistry } from './processors/registry'

const fnConfig = createFnConfig('pika')

function makeCall(overrides: Partial<MacroCall>): MacroCall {
	return {
		variant: fnConfig.variants.get('pika')!,
		start: 0,
		end: 10,
		loc: { line: 1, column: 0 },
		args: ['bg:red'] as any,
		quote: '\'',
		...overrides,
	}
}

// Mocked split-phase engine (#114): `prepareUse` resolves an opaque plan (here
// simply the final name list) and the sync `commitUse` turns a plan into names.
function makeEngine(prepareImpl?: (...args: any[]) => Promise<string[]>): Engine {
	return {
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
		expect(analyzed?.calls[0]!.variant.name)
			.toBe('pika')
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

describe('prepareModule', () => {
	it('prepares calls sequentially in list order without committing anything', async () => {
		const order: string[] = []
		const engine = makeEngine(async (...args: any[]) => {
			order.push(args[0])
			return [`pk-${args[0]}`]
		})
		const analyzed: AnalyzedModule = {
			id: '/m.ts',
			code: 'pika(\'a\'); pika.arr(\'b\')',
			calls: [
				makeCall({ start: 0, end: 9, args: ['a'] as any }),
				makeCall({ variant: fnConfig.variants.get('pika.arr')!, start: 11, end: 24, args: ['b'] as any, quote: '"' }),
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
				{ plan: ['pk-b'], start: 11, end: 24, format: 'array', quote: '"' },
			])
		expect(prepared.sourceHash)
			.toBe(hashSource(analyzed.code))
	})

	it('wraps engine failures in a positioned PikaTransformError and commits nothing', async () => {
		const engine = makeEngine(async () => {
			throw new Error('engine boom')
		})
		const analyzed: AnalyzedModule = {
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
			id: '/m.ts',
			code: 'pika(\'a\'); pika(\'boom\'); pika(\'c\')',
			calls: [
				makeCall({ start: 0, end: 9, args: ['a'] as any }),
				makeCall({ start: 11, end: 23, args: ['boom'] as any }),
				makeCall({ start: 25, end: 34, args: ['c'] as any }),
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
			id: '/m.ts',
			code: 'pika(\'a\'); pika.arr(\'b\')',
			calls: [
				makeCall({ start: 0, end: 9, args: ['a'] as any }),
				makeCall({ variant: fnConfig.variants.get('pika.arr')!, start: 11, end: 24, args: ['b'] as any, quote: '"' }),
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
				{ start: 11, end: 24, content: '["pk-b"]' },
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
