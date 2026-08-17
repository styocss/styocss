/**
 * #113 — generated TypeScript declarations are a deterministic projection of
 * the effective project/type configuration. Source usage records, transform
 * order, and the observed module set are deliberately NOT inputs: equivalent
 * configurations must produce byte-for-byte identical declarations.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createCtx } from './ctx'

const createdDirs: string[] = []

async function createRoot() {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-ts-determinism-')))
	createdDirs.push(root)
	await mkdir(join(root, 'src'), { recursive: true })
	await writeFile(join(root, 'src/a-red.ts'), 'export const a = pika({ color: \'red\' })\n')
	await writeFile(join(root, 'src/b-flex.ts'), 'export const b = pika({ display: \'flex\' })\n')
	return root
}

async function createEquivalentCtx(root: string) {
	const ctx = createCtx({
		cwd: root,
		currentPackageName: '@pikacss/core',
		scan: { include: ['src/**/*.ts'], exclude: [] },
		configOrPath: {
			selectors: { definitions: [['hover', '$:hover']] },
			shortcuts: { definitions: [['btn', { display: 'flex' }]] },
		},
		fnName: 'pika',
		transformedFormat: 'string',
		tsCodegen: 'pika.gen.ts',
		autoCreateConfig: false,
	})
	await ctx.setup()
	return ctx
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

describe('typegen determinism (#113)', () => {
	it('equivalent configurations generate byte-identical declarations regardless of transform order or observed modules', async () => {
		const root = await createRoot()

		// Actor A: transforms both modules, red-first.
		const a = await createEquivalentCtx(root)
		await a.transform('export const a = pika({ color: \'red\' })', 'src/a-red.ts')
		await a.transform('export const b = pika({ display: \'flex\' })', 'src/b-flex.ts')

		// Actor B: opposite transform order (opposite atomic-id allocation).
		const b = await createEquivalentCtx(root)
		await b.transform('export const b = pika({ display: \'flex\' })', 'src/b-flex.ts')
		await b.transform('export const a = pika({ color: \'red\' })', 'src/a-red.ts')

		// Actor C: never transformed anything at all.
		const c = await createEquivalentCtx(root)

		// Actor D: build-path full scan instead of per-module transforms.
		const d = await createEquivalentCtx(root)
		await d.fullyCssCodegen()

		const [contentA, contentB, contentC, contentD] = await Promise.all([
			a.getTsCodegenContent(),
			b.getTsCodegenContent(),
			c.getTsCodegenContent(),
			d.getTsCodegenContent(),
		])

		expect(contentA)
			.toBeTypeOf('string')
		expect(contentB)
			.toBe(contentA)
		expect(contentC)
			.toBe(contentA)
		expect(contentD)
			.toBe(contentA)

		// Sanity: the actors really did observe different usage state, so the
		// identical declarations are not a vacuous comparison.
		expect(a.usages.size)
			.toBe(2)
		expect(c.usages.size)
			.toBe(0)
	})

	it('declarations change only when a genuine type-surface input changes', async () => {
		const root = await createRoot()
		const base = await createEquivalentCtx(root)
		const baseContent = await base.getTsCodegenContent()

		const renamed = createCtx({
			cwd: root,
			currentPackageName: '@pikacss/core',
			scan: { include: ['src/**/*.ts'], exclude: [] },
			configOrPath: {
				selectors: { definitions: [['hover', '$:hover']] },
				shortcuts: { definitions: [['btn', { display: 'flex' }]] },
			},
			fnName: 'styled',
			transformedFormat: 'string',
			tsCodegen: 'pika.gen.ts',
			autoCreateConfig: false,
		})
		await renamed.setup()

		expect(await renamed.getTsCodegenContent())
			.not.toBe(baseContent)
	})
})
