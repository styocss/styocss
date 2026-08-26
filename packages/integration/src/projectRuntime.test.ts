import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createDeferred } from '../../_shared/vitest'
import { createProjectRuntime } from './projectRuntime'

const created: string[] = []
const defineConfigPath = new URL('../../config/src/index.ts', import.meta.url).pathname

async function createRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'pikacss-project-runtime-'))
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

function singleConfig(options: { fnName?: string, cssModule?: string, extra?: string } = {}): string {
	return configSource(`
		export default defineConfig({
			fnName: ${JSON.stringify(options.fnName ?? 'pika')},
			cssModule: ${JSON.stringify(options.cssModule ?? 'pika.css')},
			scan: { include: ['src/**/*.ts'], exclude: [] },
			${options.extra ?? ''}
		})
	`)
}

afterEach(async () => {
	await Promise.all(created.splice(0)
		.map(path => rm(path, { recursive: true, force: true })))
})

describe('projectRuntime generation derivation', () => {
	it('derives fresh whole generations with Typegen snapshots and generation-scoped CSS routing', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), singleConfig())
		const runtime = createProjectRuntime({ projectRoot: root, mode: 'oneshot' })

		expect(await runtime.requestReload())
			.toEqual({ status: 'activated' })
		const first = await runtime.captureGeneration()
		expect(first.entries)
			.toHaveLength(1)
		expect(first.entries[0]!.typegenSnapshot)
			.toBe(first.entries[0]!.engine.typegen.snapshot)
		expect(first.entries[0]!.scanMatcher.matches(join(root, 'src/a.ts')))
			.toBe(true)
		expect(first.entries[0]!.scanMatcher.matches(join(root, 'other/a.ts')))
			.toBe(false)
		expect(await runtime.resolveCssModule('pika.css'))
			.toBe(first.entries[0]!.runtimeCssFilepath)
		expect(first.entries[0]!.runtimeCssFilepath)
			.toContain(`${first.config.stateDir}/runs/`)

		expect(await runtime.requestReload())
			.toEqual({ status: 'activated' })
		const second = await runtime.captureGeneration()
		expect(second).not.toBe(first)
		expect(second.entries[0]!.engine).not.toBe(first.entries[0]!.engine)
		expect(second.entries[0]!.runtimeCssFilepath).not.toBe(first.entries[0]!.runtimeCssFilepath)
		expect(second.config)
			.toEqual(first.config)
	})

	it('derives multi-entry routing, private discriminators, and interleaved atomic IDs', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`
			export default defineConfig([
				{ fnName: 'pika', cssModule: 'pika.css' },
				{ fnName: 'admin', cssModule: 'admin.css' },
			])
		`))
		const discriminators: Array<string | undefined> = []
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			createEntryPlugins: (_entry, index) => [{
				name: `test:host-${index}`,
				configureEngine(configurator) {
					discriminators[index] = configurator.host.privateCssDiscriminator
				},
			}],
		})
		await runtime.requestReload()
		const generation = await runtime.captureGeneration()
		const [base, admin] = generation.entries

		expect(discriminators)
			.toEqual(['a', 'b'])
		expect(generation.fnNameRouting.get('pika'))
			.toBe(base)
		expect(generation.fnNameRouting.get('admin'))
			.toBe(admin)
		expect(generation.cssModuleRouting.get('pika.css'))
			.toBe(base)
		expect(generation.cssModuleRouting.get('admin.css'))
			.toBe(admin)
		expect(dirname(base!.runtimeCssFilepath))
			.toBe(dirname(admin!.runtimeCssFilepath))
		expect(base!.runtimeCssFilepath).not.toBe(admin!.runtimeCssFilepath)

		expect(await base!.engine.use({ color: 'red' }))
			.toEqual(['pk-a'])
		expect(await admin!.engine.use({ color: 'blue' }))
			.toEqual(['pk-b'])
		expect(await base!.engine.use({ display: 'block' }))
			.toEqual(['pk-c'])
		expect(await admin!.engine.use({ display: 'flex' }))
			.toEqual(['pk-d'])
	})

	it('keeps single-form private discriminator absent', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), singleConfig())
		let discriminator: string | undefined = 'unset'
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			createEntryPlugins: () => [{
				name: 'test:single-host',
				configureEngine(configurator) {
					discriminator = configurator.host.privateCssDiscriminator
				},
			}],
		})
		await runtime.requestReload()
		expect(discriminator)
			.toBeUndefined()
	})
})

describe('projectRuntime live fixed point and failure policy', () => {
	it('discards a dependency-discovering candidate even when host arming completes immediately', async () => {
		const root = await createRoot()
		const dependency = join(root, 'tokens.json')
		await write(join(root, 'pika.config.ts'), singleConfig())
		const armCalls: string[][] = []
		let engineConfigurations = 0
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'live',
			armDependencies(dependencies) {
				armCalls.push(dependencies.map(item => `${item.type}:${item.path}`))
			},
			createEntryPlugins: () => [{
				name: 'test:dependency',
				configureEngine(configurator) {
					engineConfigurations++
					configurator.runtime.addConfigDependency(dependency)
				},
			}],
		})

		expect(await runtime.requestReload())
			.toEqual({ status: 'activated' })
		expect(engineConfigurations)
			.toBe(2)
		expect(armCalls)
			.toHaveLength(1)
		expect(runtime.getWatchState().active)
			.toContainEqual({ type: 'file', path: dependency })
		expect(runtime.getWatchState().armed)
			.toEqual(runtime.getWatchState().active)

		await runtime.requestReload()
		expect(engineConfigurations)
			.toBe(3)
	})

	it('re-projects an already-armed dependency when a failed candidate needs it for recovery', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		const dependency = join(root, 'tokens.json')
		await write(dependency, '{}')
		await write(configPath, singleConfig({ fnName: 'withDependency' }))

		const projected = new Set<string>()
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'live',
			armDependencies(dependencies) {
				for (const item of dependencies)
					projected.add(`${item.type}:${item.path}`)
			},
			createEntryPlugins(entry) {
				if (entry.fnName === 'withoutDependency')
					return []
				return [{
					name: 'test:dependency',
					configureEngine(configurator) {
						configurator.runtime.addConfigDependency(dependency)
					},
				}]
			},
			prepareActivation(candidate) {
				if (candidate.entries[0]!.config.fnName === 'recoveryFailure')
					throw new Error('candidate boom')
			},
			onActivated(_effects, generation) {
				projected.clear()
				for (const item of generation.dependencies)
					projected.add(`${item.type}:${item.path}`)
			},
		})

		expect((await runtime.requestReload()).status)
			.toBe('activated')
		expect(projected.has(`file:${dependency}`))
			.toBe(true)

		await write(configPath, singleConfig({ fnName: 'withoutDependency' }))
		expect((await runtime.requestReload()).status)
			.toBe('activated')
		expect(runtime.getWatchState().armed)
			.toContainEqual({ type: 'file', path: dependency })
		expect(projected.has(`file:${dependency}`))
			.toBe(false)

		await write(configPath, singleConfig({ fnName: 'recoveryFailure' }))
		expect((await runtime.requestReload()).status)
			.toBe('retained-last-good')
		expect(projected.has(`file:${dependency}`))
			.toBe(true)
		expect(runtime.getWatchState().recovery)
			.toContainEqual({ type: 'file', path: dependency })
	})

	it('preserves provisional Engine dependencies when configureEngine fails before finalization', async () => {
		const root = await createRoot()
		const dependency = join(root, 'broken-plugin-input.json')
		await write(join(root, 'pika.config.ts'), singleConfig())
		const projected: string[] = []
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'live',
			armDependencies(dependencies) {
				projected.push(...dependencies.map(item => `${item.type}:${item.path}`))
			},
			createEntryPlugins: () => [{
				name: 'test:broken-dependency',
				configureEngine(configurator) {
					configurator.runtime.addConfigDependency(dependency)
					throw new Error('plugin initialization failed')
				},
			}],
		})

		const result = await runtime.requestReload()
		expect(result.status)
			.toBe('failed-unready')
		expect(result.error?.message)
			.toContain('plugin initialization failed')
		expect(projected)
			.toContain(`file:${dependency}`)
		expect(runtime.getWatchState().recovery)
			.toContainEqual({ type: 'file', path: dependency })
	})

	it('retains the previous whole generation on dev failure and recovers without fallback hybrids', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		await write(configPath, singleConfig({ fnName: 'good', cssModule: 'good.css' }))
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'live',
			armDependencies() {},
		})
		await runtime.requestReload()
		const good = await runtime.captureGeneration()

		await write(configPath, `export default { broken: true }`)
		const failed = await runtime.requestReload()
		expect(failed.status)
			.toBe('retained-last-good')
		expect(await runtime.captureGeneration())
			.toBe(good)
		expect(await runtime.resolveCssModule('good.css'))
			.toBe(good.entries[0]!.runtimeCssFilepath)

		await write(configPath, singleConfig({ fnName: 'next', cssModule: 'next.css' }))
		expect((await runtime.requestReload()).status)
			.toBe('activated')
		const next = await runtime.captureGeneration()
		expect(next).not.toBe(good)
		expect(next.entries[0]!.config.fnName)
			.toBe('next')
		expect(await runtime.resolveCssModule('good.css'))
			.toBeNull()
	})

	it('does not fabricate a default generation after initial dev setup failure', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), `export default { not: 'defineConfig' }`)
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'live',
			armDependencies() {},
		})

		expect((await runtime.requestReload()).status)
			.toBe('failed-unready')
		expect(runtime.hasActiveGeneration)
			.toBe(false)
		await expect(runtime.captureGeneration()).rejects.toThrow('defineConfig')
	})
})

describe('projectRuntime stale barriers and generation capture', () => {
	it('coalesces overlapping config reloads and activates only the newest revision', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		await write(configPath, singleConfig({ fnName: 'first' }))
		const entered = createDeferred<void>()
		const release = createDeferred<void>()
		let prepares = 0
		let activations = 0
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			async prepareActivation() {
				prepares++
				if (prepares === 1) {
					entered.resolve()
					await release.promise
				}
			},
			onActivated() {
				activations++
			},
		})

		const firstReload = runtime.requestReload()
		await entered.promise
		await write(configPath, singleConfig({ fnName: 'newest' }))
		const secondReload = runtime.requestReload()
		expect(secondReload)
			.toBe(firstReload)
		release.resolve()
		await firstReload

		const active = await runtime.captureGeneration()
		expect(prepares)
			.toBe(2)
		expect(activations)
			.toBe(1)
		expect(active.configRevision)
			.toBe(runtime.configRevision)
		expect(active.entries[0]!.config.fnName)
			.toBe('newest')
	})

	it('records generation-independent KnownModules before readiness and retries a candidate stale on source revision', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), singleConfig())
		const source = join(root, 'outside-current-scan.ts')
		const entered = createDeferred<void>()
		const release = createDeferred<void>()
		let prepares = 0
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			async prepareActivation() {
				prepares++
				if (prepares === 1) {
					entered.resolve()
					await release.promise
				}
			},
		})

		expect(runtime.observeKnownModule(source, `export const value = 1`))
			.toBe(true)
		const reload = runtime.requestReload()
		await entered.promise
		expect(runtime.observeKnownModule(source, `export const value = 2`))
			.toBe(true)
		release.resolve()
		await reload

		const active = await runtime.captureGeneration()
		expect(prepares)
			.toBe(2)
		expect(active.sourceRevision)
			.toBe(runtime.sourceRevision)
		expect(active.knownModules)
			.toContainEqual(expect.objectContaining({ id: source, code: `export const value = 2` }))
		expect(active.entries[0]!.scanMatcher.matches(source))
			.toBe(false)
		const before = runtime.sourceRevision
		expect(runtime.observeKnownModule(`${source}?raw`, 'ignored'))
			.toBe(false)
		expect(runtime.observeKnownModule(join(root, 'README.md'), 'ignored'))
			.toBe(false)
		expect(runtime.sourceRevision)
			.toBe(before)
	})

	it('lets already captured old generations finish after a newer generation activates', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		await write(configPath, singleConfig({ fnName: 'old', cssModule: 'old.css' }))
		const runtime = createProjectRuntime({ projectRoot: root, mode: 'oneshot' })
		await runtime.requestReload()
		const capturedOld = await runtime.captureGeneration()

		await write(configPath, singleConfig({ fnName: 'nextGen', cssModule: 'new.css' }))
		await runtime.requestReload()
		const activeNew = await runtime.captureGeneration()
		expect(activeNew).not.toBe(capturedOld)
		expect(await capturedOld.entries[0]!.engine.use({ color: 'red' }))
			.toHaveLength(1)
		expect(capturedOld.entries[0]!.config.fnName)
			.toBe('old')
		expect(activeNew.entries[0]!.config.fnName)
			.toBe('nextGen')
	})

	it('computes host-neutral invalidation effects and invokes them only after the active swap', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		await write(configPath, singleConfig({ cssModule: 'old.css' }))
		const observed: Array<{ cssModules: readonly string[], runtimeCssFilepaths: readonly string[], activeCss: string | null }> = []
		const runtimeRef: { current: ReturnType<typeof createProjectRuntime> | null } = { current: null }
		const runtime = createProjectRuntime({
			projectRoot: root,
			mode: 'oneshot',
			async onActivated(effects) {
				observed.push({
					cssModules: effects.cssModules,
					runtimeCssFilepaths: effects.runtimeCssFilepaths,
					activeCss: await runtimeRef.current!.resolveCssModule('new.css'),
				})
			},
		})
		runtimeRef.current = runtime
		await runtime.requestReload()
		const first = await runtime.captureGeneration()
		first.entries[0]!.transformedSourceIds.add(join(root, 'src/used.ts'))

		await write(configPath, singleConfig({ cssModule: 'new.css' }))
		await runtime.requestReload()
		const active = await runtime.captureGeneration()
		expect(observed.at(-1))
			.toEqual({
				cssModules: ['new.css', 'old.css'],
				runtimeCssFilepaths: [first.entries[0]!.runtimeCssFilepath, active.entries[0]!.runtimeCssFilepath].sort(),
				activeCss: active.entries[0]!.runtimeCssFilepath,
			})
	})
})
