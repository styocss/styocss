import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createDeferred } from '../../_shared/vitest'
import { createProjectRuntime } from './projectRuntime'

const created: string[] = []
const defineConfigPath = new URL('../../config/src/index.ts', import.meta.url).pathname

async function createRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'pikacss-project-runtime-boundary-'))
	created.push(root)
	return root
}

async function write(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, content)
}

function configSource(body: string): string {
	return [
		`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
		body,
	].join('\n')
}

function singleConfig(): string {
	return configSource(`export default defineConfig({ scan: { include: ['src/**/*.ts'], exclude: [] } })`)
}

afterEach(async () => {
	await Promise.all(created.splice(0)
		.map(path => rm(path, { recursive: true, force: true })))
})

describe('projectRuntime boundary behavior', () => {
	it('requires an absolute project root and an explicit live watch-arm capability', () => {
		expect(() => createProjectRuntime({ projectRoot: 'relative', mode: 'oneshot' }))
			.toThrow('projectRoot must be absolute')
		expect(() => createProjectRuntime({ projectRoot: '/absolute', mode: 'live' }))
			.toThrow('requires an explicit host armDependencies capability')
	})

	it('hard-fails oneshot Engine derivation and preserves a non-Error cause', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), singleConfig())
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			createEntryPlugins: () => [{
				name: 'test:engine-failure',
				configureEngine() {
					// eslint-disable-next-line prefer-promise-reject-errors -- Exercise defensive preservation of a non-Error plugin rejection.
					return Promise.reject('engine-string-failure')
				},
			}],
		})

		await expect(runtime.requestReload())
			.rejects.toThrow('engine-string-failure')
		expect(runtime.hasActiveGeneration)
			.toBe(false)
	})

	it('exercises large interleaved multi-entry atomic indexes', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`
			export default defineConfig([
				{ fnName: 'pika', cssModule: 'pika.css' },
				{ fnName: 'admin', cssModule: 'admin.css' },
			])
		`))
		const runtime = createProjectRuntime({ projectRoot: root, mode: 'oneshot' })
		await runtime.requestReload()
		const [base] = (await runtime.captureGeneration()).entries

		let lastId = ''
		for (let index = 0; index <= 26; index++)
			lastId = (await base!.engine.use({ zIndex: String(index) }))[0]!
		expect(lastId)
			.toBe('pk-aa')
	})

	it('handles virtual, unchanged, changed, and deleted KnownModule observations', async () => {
		const root = await createRoot()
		const source = join(root, 'src/a.ts')
		const runtime = createProjectRuntime({ projectRoot: root, mode: 'oneshot' })

		expect(runtime.observeKnownModule('\0virtual.ts', 'virtual'))
			.toBe(false)
		expect(runtime.observeKnownModule(source, 'export const a = 1'))
			.toBe(true)
		const firstRevision = runtime.sourceRevision
		expect(runtime.observeKnownModule(source, 'export const a = 1'))
			.toBe(true)
		expect(runtime.sourceRevision)
			.toBe(firstRevision)
		expect(runtime.dropKnownModule(`${source}?raw`))
			.toBe(false)
		expect(runtime.dropKnownModule(source))
			.toBe(true)
		expect(runtime.sourceRevision)
			.toBe(firstRevision + 1)
		expect(runtime.dropKnownModule(source))
			.toBe(false)
	})

	it('rejects before startup but cold-start capture waits for an in-flight initial candidate', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), singleConfig())
		const entered = createDeferred<void>()
		const release = createDeferred<void>()
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			async prepareActivation() {
				entered.resolve()
				await release.promise
			},
		})

		await expect(runtime.captureGeneration()).rejects.toThrow('no active ProjectGeneration')
		const reload = runtime.requestReload()
		await entered.promise
		const captured = runtime.captureGeneration()
		let settled = false
		void captured.finally(() => {
			settled = true
		})
		await Promise.resolve()
		expect(settled)
			.toBe(false)
		release.resolve()
		await reload
		expect(await captured)
			.toBe(await runtime.captureGeneration())
	})

	it('retries when sourceRevision changes during Engine derivation before prepareActivation', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), singleConfig())
		const entered = createDeferred<void>()
		const release = createDeferred<void>()
		let engineConfigurations = 0
		let prepareCalls = 0
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			createEntryPlugins: () => [{
				name: 'test:derive-gate',
				async configureEngine() {
					engineConfigurations++
					if (engineConfigurations === 1) {
						entered.resolve()
						await release.promise
					}
				},
			}],
			prepareActivation() {
				prepareCalls++
			},
		})

		const reload = runtime.requestReload()
		await entered.promise
		runtime.observeKnownModule(join(root, 'src/new.ts'), 'export const value = 1')
		release.resolve()
		await reload
		expect(engineConfigurations)
			.toBe(2)
		expect(prepareCalls)
			.toBe(1)
	})

	it('does not roll back activation when post-activation host effects fail', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), singleConfig())
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			onActivated() {
				throw new Error('host invalidation failed')
			},
		})

		await expect(runtime.requestReload()).rejects.toThrow('host invalidation failed')
		expect(runtime.hasActiveGeneration)
			.toBe(true)
		expect((await runtime.captureGeneration()).entries[0]!.config.fnName)
			.toBe('pika')
	})
})

describe('projectRuntime post-activation reload coalescing', () => {
	it('does not lose a reload requested while host invalidation for the prior activation is still running', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		await write(configPath, configSource(`export default defineConfig({ fnName: 'firstGen' })`))
		const entered = createDeferred<void>()
		const release = createDeferred<void>()
		let activations = 0
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			async onActivated() {
				activations++
				if (activations === 1) {
					entered.resolve()
					await release.promise
				}
			},
		})

		const firstReload = runtime.requestReload()
		await entered.promise
		expect((await runtime.captureGeneration()).entries[0]!.config.fnName)
			.toBe('firstGen')
		await write(configPath, configSource(`export default defineConfig({ fnName: 'secondGen' })`))
		const secondReload = runtime.requestReload()
		expect(secondReload)
			.toBe(firstReload)
		release.resolve()
		await firstReload

		expect(activations)
			.toBe(2)
		expect((await runtime.captureGeneration()).entries[0]!.config.fnName)
			.toBe('secondGen')
	})
})

describe('projectRuntime candidate failure staleness', () => {
	it('discards a stale Engine-derivation failure and activates the newest config revision', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		await write(configPath, configSource(`export default defineConfig({ fnName: 'firstGen' })`))
		const entered = createDeferred<void>()
		const release = createDeferred<void>()
		let configurations = 0
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			createEntryPlugins: () => [{
				name: 'test:stale-engine-failure',
				async configureEngine() {
					configurations++
					if (configurations === 1) {
						entered.resolve()
						await release.promise
						throw new Error('obsolete candidate failure')
					}
				},
			}],
		})

		const reload = runtime.requestReload()
		await entered.promise
		await write(configPath, configSource(`export default defineConfig({ fnName: 'latestGen' })`))
		expect(runtime.requestReload())
			.toBe(reload)
		release.resolve()
		expect((await reload).status)
			.toBe('activated')
		expect((await runtime.captureGeneration()).entries[0]!.config.fnName)
			.toBe('latestGen')
	})

	it('discards a stale prepareActivation failure and continues to the newest candidate', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		await write(configPath, configSource(`export default defineConfig({ fnName: 'firstGen' })`))
		const entered = createDeferred<void>()
		const release = createDeferred<void>()
		let preparations = 0
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			async prepareActivation() {
				preparations++
				if (preparations === 1) {
					entered.resolve()
					await release.promise
					throw new Error('obsolete preparation failure')
				}
			},
		})

		const reload = runtime.requestReload()
		await entered.promise
		await write(configPath, configSource(`export default defineConfig({ fnName: 'latestGen' })`))
		expect(runtime.requestReload())
			.toBe(reload)
		release.resolve()
		expect((await reload).status)
			.toBe('activated')
		expect(preparations)
			.toBe(2)
		expect((await runtime.captureGeneration()).entries[0]!.config.fnName)
			.toBe('latestGen')
	})

	it('retains the last-good live generation when a current prepareActivation prerequisite fails', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		await write(configPath, configSource(`export default defineConfig({ fnName: 'goodGen' })`))
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'live',
			armDependencies() {},
			prepareActivation(candidate) {
				if (candidate.entries[0]!.config.fnName === 'badGen')
					throw new Error('candidate publication failed')
			},
		})
		await runtime.requestReload()
		const good = await runtime.captureGeneration()

		await write(configPath, configSource(`export default defineConfig({ fnName: 'badGen' })`))
		const result = await runtime.requestReload()
		expect(result.status)
			.toBe('retained-last-good')
		expect(result.error?.message)
			.toContain('candidate publication failed')
		expect(await runtime.captureGeneration())
			.toBe(good)
	})
})

describe('projectRuntime topology and physical-source guards', () => {
	it('exposes routing topology without mutation methods', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), singleConfig())
		const runtime = createProjectRuntime({ projectRoot: root, mode: 'oneshot' })
		await runtime.requestReload()
		const generation = await runtime.captureGeneration()

		expect(Object.isFrozen(generation.fnNameRouting))
			.toBe(true)
		expect((generation.fnNameRouting as any).set)
			.toBeUndefined()
		expect([...generation.fnNameRouting].map(([key]) => key))
			.toEqual(['pika'])
	})

	it('does not admit scheme-like virtual source ids as physical KnownModules', async () => {
		const root = await createRoot()
		const runtime = createProjectRuntime({ projectRoot: root, mode: 'oneshot' })
		const revision = runtime.sourceRevision
		expect(runtime.observeKnownModule('virtual:generated.ts', 'export const v = 1'))
			.toBe(false)
		expect(runtime.sourceRevision)
			.toBe(revision)
	})
})
