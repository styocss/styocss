/**
 * #114 — a module is one transaction: every `pika()` call resolves
 * provisionally first, and only after all of them succeed does the module
 * enter the short synchronous commit. A failed or stale attempt consumes zero
 * committed atomic IDs/store state. Interleaving is forced with explicit
 * deferreds — never timing luck.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createDeferred } from '../../_shared/vitest'
import { PikaStaleTransformError, PikaTransformError } from './compiler/errors'
import { createCtx } from './ctx'

const createdDirs: string[] = []
const defineConfigPath = new URL('../../config/src/index.ts', import.meta.url).pathname

function canonicalConfigSource(body = '{}') {
	return [
		`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
		`export default defineConfig(${body})`,
		'',
	].join('\n')
}

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-transactions-'))
	createdDirs.push(dir)
	return dir
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

function createOptions(cwd: string, plugins: any[]) {
	return {
		cwd,
		currentPackageName: '@pikacss/core',
		scan: { include: ['src/**/*.ts'], exclude: [] },
		configOrPath: { plugins },
		fnName: 'pika',
		transformedFormat: 'string' as const,
		tsCodegen: false as const,
		autoCreateConfig: false,
	}
}

describe('module transactions (#114)', () => {
	it('a later failing call leaves zero committed state from earlier calls in the module', async () => {
		const cwd = await createTempDir()
		let added = 0
		const ctx = createCtx(createOptions(cwd, [{
			name: 'test:explode-on-marker',
			transformStyleItems: (styleItems: any[]) => {
				if (styleItems.some(item => typeof item === 'object' && item != null && 'boom' in item))
					throw new Error('later call exploded')
				return styleItems
			},
			atomicStyleAdded: () => {
				added += 1
			},
		}]))
		await ctx.setup()

		// Call 1 resolves provisionally; call 2 fails. Nothing may commit.
		const code = [
			'export const a = pika({ color: \'red\' })',
			'export const b = pika({ boom: \'yes\' })',
		].join('\n')
		await expect(ctx.transform(code, 'src/partial.ts'))
			.rejects.toThrow(PikaTransformError)

		expect(ctx.engine.store.atomicStyles.size)
			.toBe(0)
		expect(ctx.engine.store.atomicStyleIds.size)
			.toBe(0)
		expect(ctx.engine.store.atomicStyleIdsByBaseKey.size)
			.toBe(0)
		expect(ctx.engine.store.atomicStyleOrder.size)
			.toBe(0)
		expect(added)
			.toBe(0)
		expect(ctx.usages.has(join(cwd, 'src/partial.ts')))
			.toBe(false)

		// The attempt burned no ordinal: the next successful module still gets
		// the first compact id.
		await ctx.transform('export const ok = pika({ color: \'blue\' })', 'src/ok.ts')
		expect(ctx.usages.get(join(cwd, 'src/ok.ts'))?.[0]?.atomicStyleIds)
			.toEqual(['pk-a'])
	})

	it('keeps the previous last-good committed state intact after a failed attempt', async () => {
		const cwd = await createTempDir()
		const ctx = createCtx(createOptions(cwd, [{
			name: 'test:explode-on-marker',
			transformStyleItems: (styleItems: any[]) => {
				if (styleItems.some(item => typeof item === 'object' && item != null && 'boom' in item))
					throw new Error('exploded')
				return styleItems
			},
		}]))
		await ctx.setup()
		const file = join(cwd, 'src/last-good.ts')

		await ctx.transform('export const a = pika({ color: \'red\' })', 'src/last-good.ts')
		const committed = ctx.usages.get(file)
		const storeSize = ctx.engine.store.atomicStyles.size
		expect(committed)
			.toHaveLength(1)

		await expect(ctx.transform([
			'export const a = pika({ color: \'green\' })',
			'export const b = pika({ boom: \'yes\' })',
		].join('\n'), 'src/last-good.ts'))
			.rejects.toThrow(PikaTransformError)

		// Usages still point at the last-good records, and the failed
		// attempt's earlier call ({ color: 'green' }) registered nothing.
		expect(ctx.usages.get(file))
			.toBe(committed)
		expect(ctx.engine.store.atomicStyles.size)
			.toBe(storeSize)
	})

	it('a superseded revision discards its finished provisional work without consuming ids', async () => {
		const cwd = await createTempDir()
		const gateRed = createDeferred()
		const gateBlue = createDeferred()
		const gates = new Map<string, Promise<void>>([
			['red', gateRed.promise],
			['blue', gateBlue.promise],
		])
		const ctx = createCtx(createOptions(cwd, [{
			name: 'test:gated-transform',
			transformStyleItems: async (styleItems: any[]) => {
				for (const item of styleItems) {
					const color = typeof item === 'object' && item != null ? (item as any).color : undefined
					const gate = typeof color === 'string' ? gates.get(color) : undefined
					if (gate != null)
						await gate
				}
				return styleItems
			},
		}]))
		await ctx.setup()
		const file = join(cwd, 'src/stale.ts')

		// Revision 1 (red) suspends inside provisional work; revision 2 (blue)
		// supersedes it and commits first; revision 1 then completes its
		// expensive work and must be discarded at the commit boundary.
		const staleTransform = ctx.transform('export const a = pika({ color: \'red\' })', 'src/stale.ts')
		staleTransform.catch(() => {})
		const freshTransform = ctx.transform('export const a = pika({ color: \'blue\' })', 'src/stale.ts')

		gateBlue.resolve()
		const fresh = await freshTransform
		gateRed.resolve()

		expect(fresh?.code)
			.toContain('\'pk-a\'')
		// The stale revision consumed zero committed ids/state — and it must
		// fail loudly, never surface as a successful no-op transform: a null
		// result would tell the bundler to serve the raw macro-bearing source.
		await expect(staleTransform)
			.rejects.toThrow(PikaStaleTransformError)
		expect(ctx.engine.store.atomicStyles.size)
			.toBe(1)
		expect([...ctx.engine.store.atomicStyles.values()][0]!.content.value)
			.toEqual(['blue'])
		expect(ctx.usages.get(file)?.[0]?.atomicStyleIds)
			.toEqual(['pk-a'])
	})

	it('dev commits follow ProjectGeneration encounter order even when prepare finishes out of order', async () => {
		const cwd = await createTempDir()
		await mkdir(join(cwd, 'src'), { recursive: true })
		await writeFile(join(cwd, 'pika.config.ts'), canonicalConfigSource(`{
			scan: { include: ['src/**/*.ts'], exclude: [] },
		}`))
		const ctx = createCtx({
			cwd,
			currentPackageName: '@pikacss/core',
			scan: { include: ['**/*'], exclude: [] },
			configOrPath: null,
			fnName: 'pika',
			transformedFormat: 'string',
			tsCodegen: false,
			autoCreateConfig: false,
		})
		await ctx.setup()

		const blueStarted = createDeferred()
		const originalPrepareUse = ctx.engine.prepareUse.bind(ctx.engine)
		ctx.engine.prepareUse = (async (...args: Parameters<typeof ctx.engine.prepareUse>) => {
			const first = args[0]
			const color = typeof first === 'object' && first != null && 'color' in first
				? (first as { color?: unknown }).color
				: undefined
			if (color === 'blue')
				blueStarted.resolve()
			if (color === 'red')
				await blueStarted.promise
			return originalPrepareUse(...args)
		}) as typeof ctx.engine.prepareUse

		const first = ctx.transform('export const a = pika({ color: \'red\' })', 'src/a.ts')
		const second = ctx.transform('export const z = pika({ color: \'blue\' })', 'src/z.ts')
		const [firstResult, secondResult] = await Promise.all([first, second])

		expect(firstResult?.code)
			.toContain('\'pk-a\'')
		expect(secondResult?.code)
			.toContain('\'pk-b\'')
		expect(ctx.usages.get(join(cwd, 'src/a.ts'))?.[0]?.atomicStyleIds)
			.toEqual(['pk-a'])
		expect(ctx.usages.get(join(cwd, 'src/z.ts'))?.[0]?.atomicStyleIds)
			.toEqual(['pk-b'])
	})

	it('a sequenced deletion supersedes in-flight prepare and stale work cannot resurrect the source', async () => {
		const cwd = await createTempDir()
		await writeFile(join(cwd, 'pika.config.ts'), canonicalConfigSource(`{
			scan: { include: ['src/**/*.ts'], exclude: [] },
		}`))
		const ctx = createCtx({
			cwd,
			currentPackageName: '@pikacss/core',
			scan: { include: ['**/*'], exclude: [] },
			configOrPath: null,
			fnName: 'pika',
			transformedFormat: 'string',
			tsCodegen: false,
			autoCreateConfig: false,
		})
		await ctx.setup()

		const prepareStarted = createDeferred()
		const releasePrepare = createDeferred()
		const originalPrepareUse = ctx.engine.prepareUse.bind(ctx.engine)
		ctx.engine.prepareUse = (async (...args: Parameters<typeof ctx.engine.prepareUse>) => {
			prepareStarted.resolve()
			await releasePrepare.promise
			return originalPrepareUse(...args)
		}) as typeof ctx.engine.prepareUse

		const stale = ctx.transform(`export const cls = pika({ color: 'red' })`, 'src/deleted.ts')
		stale.catch(() => {})
		await prepareStarted.promise

		// Deletion owns a later semantic slot and cancels the stale transform's
		// earlier slot immediately; it must not wait for obsolete prepare work.
		await ctx.dropModule('src/deleted.ts')
		expect(ctx.usages.has(join(cwd, 'src/deleted.ts')))
			.toBe(false)
		expect(ctx.engine.store.atomicStyles.size)
			.toBe(0)

		releasePrepare.resolve()
		await expect(stale)
			.rejects.toThrow(PikaStaleTransformError)
		expect(ctx.usages.has(join(cwd, 'src/deleted.ts')))
			.toBe(false)
		expect(ctx.engine.store.atomicStyles.size)
			.toBe(0)
	})

	it('an empty fall-out revision supersedes older prepare and cannot be resurrected', async () => {
		const cwd = await createTempDir()
		await writeFile(join(cwd, 'pika.config.ts'), canonicalConfigSource(`{
			scan: { include: ['src/**/*.ts'], exclude: [] },
		}`))
		const ctx = createCtx({
			cwd,
			currentPackageName: '@pikacss/core',
			scan: { include: ['**/*'], exclude: [] },
			configOrPath: null,
			fnName: 'pika',
			transformedFormat: 'string',
			tsCodegen: false,
			autoCreateConfig: false,
		})
		await ctx.setup()
		const file = join(cwd, 'src/fallout.ts')

		await ctx.transform(`export const cls = pika({ color: 'red' })`, 'src/fallout.ts')
		expect(ctx.usages.has(file))
			.toBe(true)

		const prepareStarted = createDeferred()
		const releasePrepare = createDeferred()
		const originalPrepareUse = ctx.engine.prepareUse.bind(ctx.engine)
		ctx.engine.prepareUse = (async (...args: Parameters<typeof ctx.engine.prepareUse>) => {
			prepareStarted.resolve()
			await releasePrepare.promise
			return originalPrepareUse(...args)
		}) as typeof ctx.engine.prepareUse

		const stale = ctx.transform(`export const cls = pika({ color: 'blue' })`, 'src/fallout.ts')
		stale.catch(() => {})
		await prepareStarted.promise

		expect(await ctx.transform('export const cls = 1', 'src/fallout.ts'))
			.toBeNull()
		expect(ctx.usages.has(file))
			.toBe(false)

		releasePrepare.resolve()
		await expect(stale)
			.rejects.toThrow(PikaStaleTransformError)
		expect(ctx.usages.has(file))
			.toBe(false)
	})

	it('build-mode ids follow canonical commit order even when provisional work finishes out of order', async () => {
		const cwd = await createTempDir()
		await mkdir(join(cwd, 'src'), { recursive: true })
		await writeFile(join(cwd, 'src/a.ts'), 'export const a = pika({ color: \'red\' })\n')
		await writeFile(join(cwd, 'src/z.ts'), 'export const z = pika({ color: \'blue\' })\n')

		// `a.ts` (first in canonical order) is gated until `z.ts` has entered
		// its own provisional work, so z's prepare finishes first. Commits
		// still run in sorted order, so ids must not follow completion order.
		const blueStarted = createDeferred()
		const ctx = createCtx(createOptions(cwd, [{
			name: 'test:scrambled-prepare',
			transformStyleItems: async (styleItems: any[]) => {
				const color = styleItems
					.map(item => (typeof item === 'object' && item != null ? (item as any).color : undefined))
					.find(value => typeof value === 'string')
				if (color === 'blue')
					blueStarted.resolve()
				if (color === 'red')
					await blueStarted.promise
				return styleItems
			},
		}]))
		await ctx.setup()
		await ctx.fullyCssCodegen()

		expect(ctx.usages.get(join(cwd, 'src/a.ts'))?.[0]?.atomicStyleIds)
			.toEqual(['pk-a'])
		expect(ctx.usages.get(join(cwd, 'src/z.ts'))?.[0]?.atomicStyleIds)
			.toEqual(['pk-b'])
	})

	it('a failing module aborts the whole build scan before any module commits', async () => {
		const cwd = await createTempDir()
		await mkdir(join(cwd, 'src'), { recursive: true })
		await writeFile(join(cwd, 'src/good.ts'), 'export const good = pika({ color: \'red\' })\n')
		await writeFile(join(cwd, 'src/kaboom.ts'), 'export const bad = pika({ boom: \'yes\' })\n')

		const ctx = createCtx(createOptions(cwd, [{
			name: 'test:explode-on-marker',
			transformStyleItems: (styleItems: any[]) => {
				if (styleItems.some(item => typeof item === 'object' && item != null && 'boom' in item))
					throw new Error('scan exploded')
				return styleItems
			},
		}]))
		await ctx.setup()

		// Provisional prepare fails for one module, so the sequential commit
		// stage never starts: the successfully prepared module commits nothing.
		await expect(ctx.fullyCssCodegen())
			.rejects.toThrow(PikaTransformError)
		expect(ctx.engine.store.atomicStyles.size)
			.toBe(0)
		expect(ctx.usages.size)
			.toBe(0)
	})

	it('build-mode scan skips modules without calls while committing the rest', async () => {
		const cwd = await createTempDir()
		await mkdir(join(cwd, 'src'), { recursive: true })
		await writeFile(join(cwd, 'src/a.ts'), 'export const a = pika({ color: \'red\' })\n')
		await writeFile(join(cwd, 'src/plain.ts'), 'export const plain = 1\n')
		// Matches the fn-name fast filter but resolves to zero macro calls, so
		// it reaches stage 2 analysis yet must be skipped by both the parallel
		// prepare stage and the sequential commit stage.
		await writeFile(join(cwd, 'src/pika-free.ts'), 'export const label = \'my pika string\'\n')

		const ctx = createCtx(createOptions(cwd, []))
		await ctx.setup()
		await ctx.fullyCssCodegen()

		expect(ctx.usages.get(join(cwd, 'src/a.ts'))?.[0]?.atomicStyleIds)
			.toEqual(['pk-a'])
		expect(ctx.usages.has(join(cwd, 'src/plain.ts')))
			.toBe(false)
		expect(ctx.usages.has(join(cwd, 'src/pika-free.ts')))
			.toBe(false)
		expect(ctx.engine.store.atomicStyles.size)
			.toBe(1)
	})

	it('a throwing committed notification does not fail the transform or roll back the commit', async () => {
		const cwd = await createTempDir()
		const diagnostics: any[] = []
		const ctx = createCtx({
			...createOptions(cwd, [{
				name: 'test:explosive-observer',
				atomicStyleAdded: () => {
					throw new Error('observer boom')
				},
			}]),
			onDiagnostic: diagnostic => diagnostics.push(diagnostic),
		})
		await ctx.setup()

		const result = await ctx.transform('export const a = pika({ color: \'red\' })', 'src/observer.ts')

		expect(result?.code)
			.toContain('\'pk-a\'')
		expect(ctx.engine.store.atomicStyles.has('pk-a'))
			.toBe(true)
		expect(ctx.usages.get(join(cwd, 'src/observer.ts'))?.[0]?.atomicStyleIds)
			.toEqual(['pk-a'])
		expect(diagnostics.some(diagnostic =>
			diagnostic.code === 'plugin-hook-error' && diagnostic.hook === 'atomicStyleAdded'))
			.toBe(true)
	})
})
