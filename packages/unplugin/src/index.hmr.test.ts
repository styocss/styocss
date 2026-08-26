import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { defineEngineConfig } from '@pikacss/core'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../_shared/vitest'

const mockCreateUnplugin = vi.fn(factory => ({ factory }))
const mockDebounce = vi.fn((fn: (...args: any[]) => any) => {
	const wrapped = (...args: any[]) => fn(...args)
	return wrapped
})
let capturedCtx: any = null

vi.mock('@pikacss/integration', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@pikacss/integration')>()
	return {
		...actual,
		createCtx: (...args: Parameters<typeof actual.createCtx>) => {
			capturedCtx = actual.createCtx(...args)
			return capturedCtx
		},
	}
})

vi.mock('perfect-debounce', () => ({
	debounce: mockDebounce,
}))

vi.mock('unplugin', async (importOriginal) => {
	const actual = await importOriginal<typeof import('unplugin')>()
	return {
		...actual,
		createUnplugin: mockCreateUnplugin,
	}
})

const createdDirs: string[] = []

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-unplugin-hmr-'))
	createdDirs.push(dir)
	return dir
}

async function flushAsyncWork() {
	await Promise.resolve()
	await Promise.resolve()
	await new Promise<void>(resolve => setImmediate(resolve))
}

beforeEach(() => {
	vi.clearAllMocks()
	vi.resetModules()
	capturedCtx = null
})

afterEach(async () => {
	vi.restoreAllMocks()
	vi.resetModules()
	capturedCtx = null

	while (createdDirs.length > 0) {
		await rm(createdDirs.pop()!, { recursive: true, force: true })
	}
})

describe('unpluginFactory HMR writes', () => {
	it('keeps the generated CSS stable until concurrent Vite HMR transforms settle', async () => {
		const firstGate = createDeferred()
		const secondGate = createDeferred()
		const firstEntered = createDeferred()
		const secondEntered = createDeferred()
		const cwd = await createTempDir()

		await mkdir(join(cwd, 'src'), { recursive: true })

		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory({
			cwd,
			config: defineEngineConfig({
				variables: {
					definitions: {
						'--tone-a': { value: 'red' },
						'--tone-b': { value: 'blue' },
						'--tone-c': { value: 'green' },
						'--tone-d': { value: 'gold' },
					},
				},
			}),
			tsCodegen: false,
			autoCreateConfig: false,
		}, { framework: 'vite' } as any) as any
		const viteServer = {
			moduleGraph: {
				getModuleById: vi.fn(() => undefined),
				invalidateModule: vi.fn(),
			},
			reloadModule: vi.fn(async () => {}),
		}

		plugin.vite.configResolved?.({ root: cwd, command: 'serve' } as any)
		plugin.vite.configureServer?.(viteServer as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		// The runtime CSS path is invocation-owned; read it from the context.
		const cssFilepath = capturedCtx.cssCodegenFilepath

		// The pipeline drives the split phases (#114): suspending the
		// provisional `prepareUse` keeps the transform in flight without
		// blocking other modules' engine work.
		const originalPrepareUse = capturedCtx.engine.prepareUse.bind(capturedCtx.engine)
		capturedCtx.engine.prepareUse = async (...args: any[]) => {
			const colorValue = (args.find(item => typeof item === 'object' && item != null && 'color' in item) as { color?: unknown } | undefined)?.color

			if (colorValue === 'var(--tone-a)') {
				firstEntered.resolve()
				await firstGate.promise
			}
			else if (colorValue === 'var(--tone-b)') {
				secondEntered.resolve()
				await secondGate.promise
			}

			return originalPrepareUse(...args)
		}

		const initialCss = await readFile(cssFilepath, 'utf8')

		const delayedA = plugin.transform.handler.call({}, 'export const a = pika({ color: \'var(--tone-a)\' })', join(cwd, 'src/a.ts'))
		const delayedB = plugin.transform.handler.call({}, 'export const b = pika({ color: \'var(--tone-b)\' })', join(cwd, 'src/b.ts'))

		await Promise.all([firstEntered.promise, secondEntered.promise])
		await flushAsyncWork()
		const fastC = plugin.transform.handler.call({}, 'export const c = pika({ color: \'var(--tone-c)\' })', join(cwd, 'src/c.ts'))
		const fastD = plugin.transform.handler.call({}, 'export const d = pika({ color: \'var(--tone-d)\' })', join(cwd, 'src/d.ts'))

		await Promise.all([fastC, fastD])
		await flushAsyncWork()

		expect(await readFile(cssFilepath, 'utf8'))
			.toBe(initialCss)

		firstGate.resolve()
		await delayedA
		await flushAsyncWork()

		expect(await readFile(cssFilepath, 'utf8'))
			.toBe(initialCss)

		secondGate.resolve()
		await delayedB
		await flushAsyncWork()

		const finalCss = await readFile(cssFilepath, 'utf8')

		expect(finalCss)
			.toContain('--tone-a: red;')
		expect(finalCss)
			.toContain('--tone-b: blue;')
		expect(finalCss)
			.toContain('--tone-c: green;')
		expect(finalCss)
			.toContain('--tone-d: gold;')
		expect(finalCss)
			.not.toBe(initialCss)
	})
})
