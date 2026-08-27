import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'

const publicationControl = vi.hoisted(() => {
	function deferred() {
		let resolve!: () => void
		const promise = new Promise<void>((resolvePromise) => {
			resolve = resolvePromise
		})
		return { promise, resolve }
	}
	return {
		redBlocked: deferred(),
		releaseRed: deferred(),
		bluePublished: deferred(),
		staleFailureBlocked: deferred(),
		releaseStaleFailure: deferred(),
		cyanPublished: deferred(),
	}
})

vi.mock('./generatedFileWriter', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./generatedFileWriter')>()
	return {
		...actual,
		async replaceGeneratedFile(...args: Parameters<typeof actual.replaceGeneratedFile>) {
			const content = args[1]
			if (content.includes('color: green'))
				throw new Error('publication failed')
			if (content.includes('color: purple')) {
				publicationControl.staleFailureBlocked.resolve()
				await publicationControl.releaseStaleFailure.promise
				throw new Error('stale publication failed')
			}
			if (content.includes('color: red')) {
				publicationControl.redBlocked.resolve()
				await publicationControl.releaseRed.promise
			}
			await actual.replaceGeneratedFile(...args)
			if (content.includes('color: blue'))
				publicationControl.bluePublished.resolve()
			if (content.includes('color: cyan'))
				publicationControl.cyanPublished.resolve()
		},
	}
})

const { createCtx } = await import('./ctx')

const createdDirs: string[] = []
const defineConfigPath = new URL('../../config/src/index.ts', import.meta.url).pathname

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-css-publication-'))
	createdDirs.push(dir)
	return dir
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

describe('generation entry runtime CSS publication (#149)', () => {
	it('rejects a stale slow writer after a newer publication has already replaced the runtime CSS', async () => {
		const cwd = await createTempDir()
		await writeFile(join(cwd, 'pika.config.ts'), [
			`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
			`export default defineConfig({ scan: { include: ['src/**/*.ts'], exclude: [] } })`,
			'',
		].join('\n'))
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

		await ctx.transform(`export const cls = pika({ color: 'red' })`, 'src/a.ts')
		await publicationControl.redBlocked.promise
		expect(ctx.isIdle)
			.toBe(false)

		await ctx.transform(`export const cls = pika({ color: 'blue' })`, 'src/a.ts')
		await publicationControl.bluePublished.promise
		const newest = await readFile(ctx.cssCodegenFilepath, 'utf8')
		expect(newest)
			.toContain('color: blue')
		expect(newest)
			.not.toContain('color: red')

		publicationControl.releaseRed.resolve()
		await ctx.waitForIdle()
		expect(ctx.isIdle)
			.toBe(true)

		const final = await readFile(ctx.cssCodegenFilepath, 'utf8')
		expect(final)
			.toContain('color: blue')
		expect(final)
			.not.toContain('color: red')
	})

	it('surfaces the latest publication failure through the generation idle barrier', async () => {
		const cwd = await createTempDir()
		await writeFile(join(cwd, 'pika.config.ts'), [
			`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
			`export default defineConfig({ scan: { include: ['src/**/*.ts'], exclude: [] } })`,
			'',
		].join('\n'))
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

		await ctx.transform(`export const cls = pika({ color: 'green' })`, 'src/fail.ts')
		await expect(ctx.waitForIdle())
			.rejects.toThrow('publication failed')
	})

	it('ignores a failed writer after a newer publication revision supersedes it', async () => {
		const cwd = await createTempDir()
		await writeFile(join(cwd, 'pika.config.ts'), [
			`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
			`export default defineConfig({ scan: { include: ['src/**/*.ts'], exclude: [] } })`,
			'',
		].join('\n'))
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

		await ctx.transform(`export const cls = pika({ color: 'purple' })`, 'src/stale-fail.ts')
		await publicationControl.staleFailureBlocked.promise
		await ctx.transform(`export const cls = pika({ color: 'cyan' })`, 'src/stale-fail.ts')
		await publicationControl.cyanPublished.promise
		publicationControl.releaseStaleFailure.resolve()

		await expect(ctx.waitForIdle())
			.resolves.toBeUndefined()
		const css = await readFile(ctx.cssCodegenFilepath, 'utf8')
		expect(css)
			.toContain('color: cyan')
		expect(css)
			.not.toContain('color: purple')
	})
})
