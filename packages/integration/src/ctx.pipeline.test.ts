import type { Engine } from '@pikacss/core'
import type { AnalyzedModule, MacroCall } from './processors/types'
import { describe, expect, it, vi } from 'vitest'
import { PikaTransformError } from './compiler/errors'
import { analyzeModule, commitModule, hashSource, isSameUsageList, prepareModule, rewriteModule } from './ctx.pipeline'
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

function makeEngine(useImpl?: (...args: any[]) => Promise<string[]>): Engine {
	return {
		use: vi.fn(useImpl ?? (async (...args: any[]) => args.map((_, i) => `pk-${i}`))),
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
})

describe('prepareModule', () => {
	it('resolves calls sequentially in list order and builds replacements + usage lists', async () => {
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
		expect(prepared.replacements)
			.toEqual([
				{ start: 0, end: 9, content: '\'pk-a\'' },
				{ start: 11, end: 24, content: '["pk-b"]' },
			])
		expect(prepared.usageList)
			.toEqual([
				{ atomicStyleIds: ['pk-a'] },
				{ atomicStyleIds: ['pk-b'] },
			])
		expect(prepared.sourceHash)
			.toBe(hashSource(analyzed.code))
	})

	it('serializes normal calls per transformedFormat and escapes quotes', async () => {
		const engine = makeEngine(async () => ['it\'s', 'b'])
		const analyzed: AnalyzedModule = {
			id: '/m.ts',
			code: 'x',
			calls: [makeCall({})],
		}
		const asArray = await prepareModule(analyzed, { engine, transformedFormat: 'array' })
		expect(asArray.replacements[0]!.content)
			.toBe('[\'it\\\'s\', \'b\']')
		const asString = await prepareModule(analyzed, { engine, transformedFormat: 'string' })
		expect(asString.replacements[0]!.content)
			.toBe('\'it\\\'s b\'')
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
	})
})

describe('commitModule', () => {
	function makeDeps() {
		return {
			usages: new Map(),
			triggerStyleUpdated: vi.fn(),
		}
	}
	const usage = { atomicStyleIds: ['pk-a'] }

	it('commits usages and fires triggers on first commit', () => {
		const deps = makeDeps()
		commitModule({ id: '/m.ts', sourceHash: 'h', replacements: [], usageList: [usage] }, deps)
		expect(deps.usages.get('/m.ts'))
			.toEqual([usage])
		expect(deps.triggerStyleUpdated)
			.toHaveBeenCalledTimes(1)
	})

	it('skips triggers when records are unchanged, fires when they differ', () => {
		const deps = makeDeps()
		const prepared = { id: '/m.ts', sourceHash: 'h', replacements: [], usageList: [usage] }
		commitModule(prepared, deps)
		commitModule(prepared, deps)
		expect(deps.triggerStyleUpdated)
			.toHaveBeenCalledTimes(1)
		commitModule({ ...prepared, usageList: [{ atomicStyleIds: ['pk-b'] }] }, deps)
		expect(deps.triggerStyleUpdated)
			.toHaveBeenCalledTimes(2)
	})

	it('deletes entries on an empty usage list, triggering only when styles existed', () => {
		const deps = makeDeps()
		const empty = { id: '/m.ts', sourceHash: 'h', replacements: [], usageList: [] }
		commitModule(empty, deps)
		expect(deps.triggerStyleUpdated)
			.not.toHaveBeenCalled()
		commitModule({ ...empty, usageList: [usage] }, deps)
		commitModule(empty, deps)
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
