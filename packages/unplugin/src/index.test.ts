import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../_shared/vitest'

const mockReadFileSync = vi.fn()
const mockCreateCtx = vi.fn()
const mockCreateUnplugin = vi.fn(factory => ({ factory }))
const mockDebounce = vi.fn((fn: (...args: any[]) => any) => {
	const wrapped = (...args: any[]) => fn(...args)
	return wrapped
})
const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

vi.mock('node:fs', () => ({
	readFileSync: mockReadFileSync,
}))

vi.mock('@pikacss/integration', () => ({
	createCtx: mockCreateCtx,
	log: mockLog,
	getDiagnosticScope: () => ({}),
	runWithDiagnosticScope: (_scope: any, fn: () => any) => fn(),
}))

vi.mock('perfect-debounce', () => ({
	debounce: mockDebounce,
}))

vi.mock('unplugin', () => ({
	createUnplugin: mockCreateUnplugin,
}))

function createHook() {
	const listeners: Array<() => unknown> = []

	return {
		listeners,
		on: vi.fn((listener: () => unknown) => {
			listeners.push(listener)
		}),
		async emit() {
			for (const listener of listeners)
				await listener()
		},
	}
}

function createCtxStub() {
	const hooks = {
		styleUpdated: createHook(),
		tsCodegenUpdated: createHook(),
	}
	// Mirror the real IntegrationContext idle tracking: transforms mark the
	// context busy while in flight, `isIdle`/`waitForIdle` reflect that state.
	let activeTransforms = 0
	let idleWaiters: Array<() => void> = []
	function notifyIdle() {
		if (activeTransforms > 0 || idleWaiters.length === 0)
			return
		const waiters = idleWaiters
		idleWaiters = []
		waiters.forEach(resolveWaiter => resolveWaiter())
	}
	const stub = {
		cwd: '/initial',
		usages: new Map([
			['src/demo.ts', [{ atomicStyleIds: ['pk-a'] }]],
		]),
		// Mirrors the real ctx: a successful setup swaps in a brand-new engine
		// instance, which is how the plugin tells a real re-derivation apart from
		// the retain-last-good path. `retainEngine` opts into that second case.
		retainEngine: false,
		setup: vi.fn(async () => {
			hooks.styleUpdated.listeners.length = 0
			hooks.tsCodegenUpdated.listeners.length = 0
			// New identity, same surface: tests that configure the engine (e.g.
			// `configDependencies`) must keep seeing what they set.
			if (!stub.retainEngine)
				stub.engine = { ...stub.engine }
		}),
		fullyCssCodegen: vi.fn(async () => {}),
		writeCssCodegenFile: vi.fn(async () => {}),
		writeTsCodegenFile: vi.fn(async () => {}),
		// Tests customize transform behavior via `transformImpl`; the `transform`
		// wrapper keeps the idle bookkeeping intact.
		transformImpl: vi.fn(async (..._args: any[]) => ({ code: 'transformed' })),
		transform: vi.fn(async (...args: any[]) => {
			activeTransforms++
			try {
				return await stub.transformImpl(...args)
			}
			finally {
				activeTransforms--
				notifyIdle()
			}
		}),
		get isIdle() {
			return activeTransforms === 0
		},
		waitForIdle: vi.fn(() => {
			if (activeTransforms === 0)
				return Promise.resolve()
			return new Promise<void>((resolveWaiter) => {
				idleWaiters.push(resolveWaiter)
			})
		}),
		isTransformTarget: vi.fn(() => true),
		// Mirror the real dropModule: clears state and queues CSS regeneration
		// through the ctx hooks only when the file had styles.
		dropModule: vi.fn((id: string) => {
			const hadUsages = stub.usages.delete(id)
			if (hadUsages)
				void hooks.styleUpdated.emit()
		}),
		getScannedButNotTransformedFiles: vi.fn(() => [] as string[]),
		transformFilter: {
			include: ['src/**/*.ts'],
			exclude: [],
		},
		cssCodegenFilepath: '/tmp/pika.gen.css',
		tsCodegenFilepath: '/tmp/pika.gen.ts',
		resolvedConfigPath: '/tmp/pika.config.ts' as string | null,
		resolvedConfigContent: 'before',
		hooks,
		engine: {
			store: {
				atomicStyleIds: {
					size: 2,
				},
			},
		},
	}
	return stub
}

async function flushAsyncWork() {
	await Promise.resolve()
	await Promise.resolve()
	await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => {
	vi.clearAllMocks()
	mockReadFileSync.mockReturnValue('before')
})

describe('unpluginFactory', () => {
	it('resolves default options, wires vite lifecycle hooks, and keeps generated assets in sync', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any
		const demoMod = { id: 'src/demo.ts' }
		const viteServer = {
			moduleGraph: {
				getModuleById: vi.fn(() => demoMod),
				getModulesByFile: vi.fn(() => new Set([demoMod])),
				invalidateModule: vi.fn(),
			},
			reloadModule: vi.fn(async () => {}),
			hot: { send: vi.fn() },
		}

		expect(mockCreateCtx)
			.toHaveBeenCalledWith(expect.objectContaining({
				currentPackageName: '@pikacss/unplugin-pikacss',
				tsCodegen: 'pika.gen.ts',
				fnName: 'pika',
				transformedFormat: 'string',
				autoCreateConfig: false,
				scan: {
					include: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'],
					exclude: ['node_modules/**', 'dist/**', '.git/**', '.nuxt/**', '.output/**', 'coverage/**'],
				},
			}))

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		plugin.vite.configureServer?.(viteServer as any)

		const buildContext = { addWatchFile: vi.fn() }
		await plugin.buildStart.call(buildContext as any)
		await plugin.buildStart.call(buildContext as any)

		expect(ctx.cwd)
			.toBe('/app')
		expect(ctx.setup)
			.toHaveBeenCalledTimes(1)
		expect(ctx.fullyCssCodegen)
			.not.toHaveBeenCalled()
		expect(buildContext.addWatchFile)
			.toHaveBeenCalledWith('/tmp/pika.config.ts')
		expect(await plugin.resolveId?.call({}, 'pika.css'))
			.toBe('/tmp/pika.gen.css')
		expect(await plugin.resolveId?.call({}, 'plain.css'))
			.toBeNull()
		expect(plugin.transform.filter.id)
			.toEqual(ctx.transformFilter)
		expect(await plugin.transform.handler.call({}, 'code', 'src/demo.ts'))
			.toEqual({ code: 'transformed' })

		await ctx.hooks.styleUpdated.emit()
		await ctx.hooks.tsCodegenUpdated.emit()
		await flushAsyncWork()

		expect(ctx.writeCssCodegenFile)
			.toHaveBeenCalled()
		expect(ctx.writeTsCodegenFile)
			.toHaveBeenCalled()

		mockReadFileSync.mockReturnValue('after')
		plugin.watchChange?.('/tmp/pika.config.ts')
		await flushAsyncWork()

		expect(ctx.setup)
			.toHaveBeenCalledTimes(2)
		expect(viteServer.moduleGraph.getModuleById)
			.toHaveBeenCalledWith('src/demo.ts')
		expect(viteServer.moduleGraph.invalidateModule)
			.toHaveBeenCalledWith(demoMod)

		const cssWritesBefore = ctx.writeCssCodegenFile.mock.calls.length
		const tsWritesBefore = ctx.writeTsCodegenFile.mock.calls.length

		await ctx.hooks.styleUpdated.emit()
		await ctx.hooks.tsCodegenUpdated.emit()
		await flushAsyncWork()

		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(1)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(1)
	})

	it('invalidates every module variant of a usage file and forces a full reload on re-derivation', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any
		// A Vue SFC owns several module graph nodes; `ctx.usages` only knows the
		// query-stripped file path, so `getModuleById` reaches just the main one.
		const mainMod = { id: 'src/demo.ts' }
		const templateMod = { id: 'src/demo.ts?vue&type=template' }
		const viteServer = {
			moduleGraph: {
				getModuleById: vi.fn(() => mainMod),
				getModulesByFile: vi.fn(() => new Set([mainMod, templateMod])),
				invalidateModule: vi.fn(),
			},
			reloadModule: vi.fn(async () => {}),
			hot: { send: vi.fn() },
		}

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		plugin.vite.configureServer?.(viteServer as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		mockReadFileSync.mockReturnValue('after')
		plugin.watchChange?.('/tmp/pika.config.ts')
		await flushAsyncWork()

		expect(viteServer.moduleGraph.getModulesByFile)
			.toHaveBeenCalledWith('src/demo.ts')
		expect(viteServer.moduleGraph.invalidateModule)
			.toHaveBeenCalledWith(templateMod)
		expect(viteServer.moduleGraph.invalidateModule)
			.toHaveBeenCalledWith(mainMod)
		expect(viteServer.hot.send)
			.toHaveBeenCalledWith({ type: 'full-reload' })
		// `reloadModule` only broadcasts an HMR message — no server-side
		// transform — so it buys nothing ahead of a full reload.
		expect(viteServer.reloadModule)
			.not
			.toHaveBeenCalled()
	})

	it('skips invalidation and reload when setup retained the previous engine', async () => {
		const ctx = createCtxStub()
		// A config edit that fails to evaluate keeps the last-good engine, its
		// store, and every usage: no atomic style id moved, so blowing away the
		// page's state would be pure collateral damage.
		ctx.retainEngine = true
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any
		const mainMod = { id: 'src/demo.ts' }
		const viteServer = {
			moduleGraph: {
				getModuleById: vi.fn(() => mainMod),
				getModulesByFile: vi.fn(() => new Set([mainMod])),
				invalidateModule: vi.fn(),
			},
			reloadModule: vi.fn(async () => {}),
			hot: { send: vi.fn() },
		}

		plugin.vite.configResolved?.({ root: '/retained-app', command: 'serve' } as any)
		plugin.vite.configureServer?.(viteServer as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		mockReadFileSync.mockReturnValue('after')
		plugin.watchChange?.('/tmp/pika.config.ts')
		await flushAsyncWork()

		expect(ctx.setup)
			.toHaveBeenCalledTimes(2)
		expect(viteServer.moduleGraph.invalidateModule)
			.not
			.toHaveBeenCalled()
		expect(viteServer.hot.send)
			.not
			.toHaveBeenCalled()
	})

	it('treats missing vite modules as a no-op during reload invalidation', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any
		const viteServer = {
			moduleGraph: {
				getModuleById: vi.fn(() => undefined),
				getModulesByFile: vi.fn(() => undefined),
				invalidateModule: vi.fn(),
			},
			reloadModule: vi.fn(async () => {}),
			hot: { send: vi.fn() },
		}

		plugin.vite.configResolved?.({ root: '/no-module-app', command: 'serve' } as any)
		plugin.vite.configureServer?.(viteServer as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		mockReadFileSync.mockReturnValue('changed')
		plugin.watchChange?.('/tmp/pika.config.ts')
		await flushAsyncWork()

		expect(viteServer.moduleGraph.invalidateModule)
			.not.toHaveBeenCalled()
		// Nothing to invalidate, but the ids were still reassigned, so whatever
		// the browser is holding has to go.
		expect(viteServer.hot.send)
			.toHaveBeenCalledWith({ type: 'full-reload' })
	})

	it('supports webpack build mode, watches config changes, and adds config files during transform', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory({
			config: 'pika.config.js',
			tsCodegen: false,
			scan: {
				include: 'src/**/*.vue',
				exclude: 'fixtures/**',
			},
			fnName: 'styled',
			transformedFormat: 'array',
			autoCreateConfig: false,
		}, { framework: 'webpack' } as any) as any

		plugin.webpack?.({
			options: {
				context: '/webpack-app',
				mode: 'production',
			},
		} as any)

		const buildContext = { addWatchFile: vi.fn() }
		await plugin.buildStart.call(buildContext as any)

		expect(mockCreateCtx)
			.toHaveBeenLastCalledWith(expect.objectContaining({
				configOrPath: 'pika.config.js',
				tsCodegen: false,
				fnName: 'styled',
				transformedFormat: 'array',
				autoCreateConfig: false,
				scan: {
					include: ['src/**/*.vue'],
					exclude: ['fixtures/**'],
				},
			}))
		expect(ctx.cwd)
			.toBe('/webpack-app')
		expect(ctx.fullyCssCodegen)
			.toHaveBeenCalledTimes(1)

		const transformContext = { addWatchFile: vi.fn() }
		await plugin.transform.handler.call(transformContext as any, 'code', 'src/component.vue')
		expect(transformContext.addWatchFile)
			.toHaveBeenCalledWith('/tmp/pika.config.ts')

		mockReadFileSync.mockReturnValue('before')
		plugin.watchChange?.('/tmp/pika.config.ts')
		plugin.watchChange?.('/tmp/other.config.ts')
		expect(ctx.setup)
			.toHaveBeenCalledTimes(1)
	})

	it('never registers watch files in esbuild builds where addWatchFile throws', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'esbuild' } as any) as any

		const buildContext = {
			addWatchFile: vi.fn(() => {
				throw new Error('unplugin/esbuild: addWatchFile outside supported hooks')
			}),
		}
		await plugin.buildStart.call(buildContext as any)

		expect(buildContext.addWatchFile)
			.not.toHaveBeenCalled()
	})

	it('registers engine config dependencies as watch files and reloads when they change', async () => {
		const ctx = createCtxStub() as any
		ctx.engine.configDependencies = new Set(['/tmp/design.md'])
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		const buildContext = { addWatchFile: vi.fn() }
		await plugin.buildStart.call(buildContext as any)
		expect(buildContext.addWatchFile)
			.toHaveBeenCalledWith('/tmp/design.md')
		expect(ctx.setup)
			.toHaveBeenCalledTimes(1)

		// Touched but byte-identical: re-deriving would reassign every atomic
		// style id for nothing, so it must not happen.
		plugin.watchChange?.('/tmp/design.md')
		await flushAsyncWork()
		expect(ctx.setup)
			.toHaveBeenCalledTimes(1)

		mockReadFileSync.mockReturnValue('after')
		plugin.watchChange?.('/tmp/design.md')
		await flushAsyncWork()
		expect(ctx.setup)
			.toHaveBeenCalledTimes(2)

		// Saving the same content again after a real change is a no-op: the
		// successful setup refreshed the snapshot.
		plugin.watchChange?.('/tmp/design.md')
		await flushAsyncWork()
		expect(ctx.setup)
			.toHaveBeenCalledTimes(2)

		// Deleted or unreadable counts as changed, not as unchanged.
		mockReadFileSync.mockImplementation(() => {
			throw new Error('ENOENT')
		})
		plugin.watchChange?.('/tmp/design.md')
		await flushAsyncWork()
		expect(ctx.setup)
			.toHaveBeenCalledTimes(3)
	})

	it('keeps retrying a config dependency whose setup retained the previous engine', async () => {
		const ctx = createCtxStub() as any
		ctx.engine.configDependencies = new Set(['/tmp/design.md'])
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		// From here every setup fails and keeps the last-good engine, so the live
		// engine never consumes the new content.
		ctx.retainEngine = true
		mockReadFileSync.mockReturnValue('after')
		plugin.watchChange?.('/tmp/design.md')
		await flushAsyncWork()
		expect(ctx.setup)
			.toHaveBeenCalledTimes(2)

		// Saving the identical content again must retry rather than be dismissed
		// as unchanged: recording it on the watcher side would strand the engine
		// on the old contents with nothing left to trigger a reload.
		plugin.watchChange?.('/tmp/design.md')
		await flushAsyncWork()
		expect(ctx.setup)
			.toHaveBeenCalledTimes(3)
	})

	it('drops usages of deleted source files and rewrites generated outputs', async () => {
		const ctx = createCtxStub() as any
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		plugin.watchChange?.('src/demo.ts', { event: 'delete' })
		await flushAsyncWork()

		expect(ctx.usages.has('src/demo.ts'))
			.toBe(false)
		expect(ctx.writeCssCodegenFile)
			.toHaveBeenCalled()
	})

	it('dev mode: recovers after a failed setup instead of poisoning later builds', async () => {
		const ctx = createCtxStub() as any
		ctx.setup = vi.fn()
			// A non-Error rejection also exercises the `?? error` fallback.
			.mockRejectedValueOnce('boom')
			.mockResolvedValue(undefined)
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any
		// Serve mode retains-last-good: a failed setup is logged, not fatal.
		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		expect(mockLog.error)
			.toHaveBeenCalled()

		mockReadFileSync.mockReturnValue('changed')
		plugin.watchChange?.('/tmp/pika.config.ts')
		await flushAsyncWork()
		expect(ctx.setup)
			.toHaveBeenCalledTimes(2)
	})

	it('build mode: propagates a failed setup so the bundler fails the build', async () => {
		const ctx = createCtxStub() as any
		ctx.setup = vi.fn()
			.mockRejectedValueOnce(new Error('bad config'))
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any
		// Default mode is build; the failed setup must reject buildStart.
		await expect(plugin.buildStart.call({ addWatchFile: vi.fn() } as any))
			.rejects
			.toThrow('bad config')
		expect(ctx.configErrorBehavior)
			.toBe('throw')
	})

	it('applies a pending reload on the next build when a config change raced the debounce', async () => {
		const ctx = createCtxStub() as any
		mockCreateCtx.mockReturnValue(ctx)
		// The factory creates three debounced fns (css write, ts write, setup);
		// make the third — debouncedSetup — a no-op so the pending flag survives.
		mockDebounce.mockImplementationOnce((fn: (...args: any[]) => any) => fn)
		mockDebounce.mockImplementationOnce((fn: (...args: any[]) => any) => fn)
		mockDebounce.mockImplementationOnce(() => () => {})
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		expect(ctx.setup)
			.toHaveBeenCalledTimes(1)

		mockReadFileSync.mockReturnValue('changed')
		plugin.watchChange?.('/tmp/pika.config.ts')

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		expect(ctx.setup)
			.toHaveBeenCalledTimes(2)
	})

	it('skips watch registration when no resolved config path is available', async () => {
		const ctx = createCtxStub()
		ctx.resolvedConfigPath = null
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'webpack' } as any) as any

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		const transformContext = { addWatchFile: vi.fn() }
		await plugin.transform.handler.call(transformContext as any, 'code', 'src/entry.ts')

		expect(transformContext.addWatchFile)
			.not.toHaveBeenCalled()
	})

	it('invalidates rspack runtimes during reload setup and maps the esbuild virtual module', async () => {
		const mod = await import('./index')

		const rspackCtx = createCtxStub()
		mockCreateCtx.mockReturnValueOnce(rspackCtx)
		const rspackPlugin = mod.unpluginFactory(undefined, { framework: 'rspack' } as any) as any
		const rspackCompiler = {
			options: {
				context: '/rspack-app',
				mode: 'development',
			},
			watching: {
				invalidateWithChangesAndRemovals: vi.fn(),
				invalidate: vi.fn(),
			},
		}

		rspackPlugin.rspack?.(rspackCompiler as any)
		await rspackPlugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		mockReadFileSync.mockReturnValue('changed')
		rspackPlugin.watchChange?.('/tmp/pika.config.ts')
		await flushAsyncWork()

		expect(rspackCompiler.watching.invalidateWithChangesAndRemovals)
			.toHaveBeenCalledWith(new Set(['src/demo.ts']))
		expect(rspackCompiler.watching.invalidate)
			.toHaveBeenCalled()

		const silentRspackCtx = createCtxStub()
		mockCreateCtx.mockReturnValueOnce(silentRspackCtx)
		const silentRspackPlugin = mod.unpluginFactory(undefined, { framework: 'rspack' } as any) as any
		silentRspackPlugin.rspack?.({ options: {} } as any)
		await silentRspackPlugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		mockReadFileSync.mockReturnValue('changed-rspack')
		silentRspackPlugin.watchChange?.('/tmp/pika.config.ts')

		const esbuildCtx = createCtxStub()
		mockCreateCtx.mockReturnValueOnce(esbuildCtx)
		const esbuildPlugin = mod.unpluginFactory(undefined, { framework: 'esbuild' } as any) as any
		const onResolve = vi.fn()

		await esbuildPlugin.esbuild.setup({
			initialOptions: {
				absWorkingDir: '/esbuild-app',
			},
			onResolve,
		} as any)

		expect(esbuildCtx.cwd)
			.toBe('/esbuild-app')
		const resolver = onResolve.mock.calls[0]![1]
		expect(await resolver({ path: 'pika.css' }))
			.toEqual({
				path: '/tmp/pika.gen.css',
				namespace: 'file',
			})
		expect(esbuildPlugin.resolveId)
			.toBeUndefined()
	})

	it('covers alternative framework configurations: vite build, webpack dev with reload, and esbuild without cwd', async () => {
		const mod = await import('./index')

		// Vite build mode
		const viteCtx = createCtxStub()
		mockCreateCtx.mockReturnValueOnce(viteCtx)
		const vitePlugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any
		vitePlugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)

		// Webpack with no context and development mode, triggers config reload
		const webpackCtx = createCtxStub()
		mockCreateCtx.mockReturnValueOnce(webpackCtx)
		const webpackPlugin = mod.unpluginFactory(undefined, { framework: 'webpack' } as any) as any
		webpackPlugin.webpack?.({ options: { mode: 'development' } } as any)
		await webpackPlugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		mockReadFileSync.mockReturnValue('changed-wp')
		webpackPlugin.watchChange?.('/tmp/pika.config.ts')
		await flushAsyncWork()
		expect(webpackCtx.setup)
			.toHaveBeenCalledTimes(2)

		// Esbuild with no absWorkingDir
		const esbuildCtx = createCtxStub()
		mockCreateCtx.mockReturnValueOnce(esbuildCtx)
		const esbuildPlugin = mod.unpluginFactory(undefined, { framework: 'esbuild' } as any) as any
		await esbuildPlugin.esbuild.setup({ initialOptions: {}, onResolve: vi.fn() } as any)
	})

	it('defers css and ts writes until concurrent transform handlers settle', async () => {
		const firstGate = createDeferred()
		const secondGate = createDeferred()
		const ctx = createCtxStub()

		ctx.transformImpl = vi.fn(async (...args: any[]) => {
			const [, id] = args as [string, string]

			await ctx.hooks.styleUpdated.emit()
			await ctx.hooks.tsCodegenUpdated.emit()

			if (id.endsWith('a.ts')) {
				await firstGate.promise
			}
			else {
				await secondGate.promise
			}

			return { code: `transformed:${id}` }
		})
		mockCreateCtx.mockReturnValue(ctx)

		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		const cssWritesBefore = ctx.writeCssCodegenFile.mock.calls.length
		const tsWritesBefore = ctx.writeTsCodegenFile.mock.calls.length

		const firstTransform = plugin.transform.handler.call({}, 'code', 'src/a.ts')
		const secondTransform = plugin.transform.handler.call({}, 'code', 'src/b.ts')

		await flushAsyncWork()

		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(0)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(0)

		firstGate.resolve()
		await firstTransform
		await flushAsyncWork()

		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(0)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(0)

		secondGate.resolve()
		await secondTransform

		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(1)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(1)
	})

	it('waits for the remaining concurrent transform when one handler rejects after queueing writes', async () => {
		const failedGate = createDeferred()
		const secondGate = createDeferred()
		const ctx = createCtxStub()

		ctx.transformImpl = vi.fn(async (...args: any[]) => {
			const [, id] = args as [string, string]

			await ctx.hooks.styleUpdated.emit()
			await ctx.hooks.tsCodegenUpdated.emit()

			if (id.endsWith('a.ts')) {
				await failedGate.promise
				throw new Error('boom')
			}

			await secondGate.promise
			return { code: `transformed:${id}` }
		})
		mockCreateCtx.mockReturnValue(ctx)

		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		const cssWritesBefore = ctx.writeCssCodegenFile.mock.calls.length
		const tsWritesBefore = ctx.writeTsCodegenFile.mock.calls.length

		const failingTransform = plugin.transform.handler.call({}, 'code', 'src/a.ts')
		const secondTransform = plugin.transform.handler.call({}, 'code', 'src/b.ts')

		await flushAsyncWork()

		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(0)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(0)

		failedGate.resolve()
		await expect(failingTransform)
			.rejects.toThrow('boom')
		await flushAsyncWork()

		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(0)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(0)

		secondGate.resolve()
		await secondTransform

		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(1)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(1)
	})

	it('logs a failed fire-and-forget write instead of raising an unhandled rejection, then keeps later writes working', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)

		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		ctx.writeCssCodegenFile.mockRejectedValueOnce(new Error('css write failed'))
		ctx.writeCssCodegenFile.mockResolvedValue(undefined)
		ctx.writeTsCodegenFile.mockResolvedValue(undefined)

		const cssWritesBefore = ctx.writeCssCodegenFile.mock.calls.length
		const tsWritesBefore = ctx.writeTsCodegenFile.mock.calls.length

		// The event hook discards listener return values in production, so the
		// listener itself must attach the rejection handler: the emit resolves,
		// the failure is logged, and the test process survives (vitest fails on
		// unhandled rejections).
		await ctx.hooks.styleUpdated.emit()
		await flushAsyncWork()

		expect(mockLog.error)
			.toHaveBeenCalledWith(expect.stringContaining('css write failed'), expect.any(Error))
		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(1)

		// The pending flag survives the failure, so the next queued write
		// retries the css output alongside the ts output.
		await ctx.hooks.tsCodegenUpdated.emit()
		await flushAsyncWork()
		await ctx.hooks.styleUpdated.emit()
		await flushAsyncWork()

		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(3)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(1)
	})

	it('retries queued ts writes when a shared css+ts flush fails on css first', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)

		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		ctx.writeCssCodegenFile.mockRejectedValueOnce(new Error('css write failed'))
		ctx.writeCssCodegenFile.mockResolvedValue(undefined)
		ctx.writeTsCodegenFile.mockResolvedValue(undefined)

		const cssWritesBefore = ctx.writeCssCodegenFile.mock.calls.length
		const tsWritesBefore = ctx.writeTsCodegenFile.mock.calls.length

		// Emit concurrently so both pending flags are queued into one shared flush.
		await Promise.all([
			ctx.hooks.styleUpdated.emit(),
			ctx.hooks.tsCodegenUpdated.emit(),
		])
		await flushAsyncWork()

		expect(mockLog.error)
			.toHaveBeenCalledWith(expect.stringContaining('css write failed'), expect.any(Error))
		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(2)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(1)
	})

	it('retries queued ts writes when a shared css+ts flush fails on ts after css succeeds', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)

		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		ctx.writeCssCodegenFile.mockResolvedValue(undefined)
		ctx.writeTsCodegenFile.mockRejectedValueOnce(new Error('ts write failed'))
		ctx.writeTsCodegenFile.mockResolvedValue(undefined)

		const cssWritesBefore = ctx.writeCssCodegenFile.mock.calls.length
		const tsWritesBefore = ctx.writeTsCodegenFile.mock.calls.length

		// Emit concurrently so both pending flags are queued into one shared flush.
		await Promise.all([
			ctx.hooks.styleUpdated.emit(),
			ctx.hooks.tsCodegenUpdated.emit(),
		])
		await flushAsyncWork()

		expect(mockLog.error)
			.toHaveBeenCalledWith(expect.stringContaining('ts write failed'), expect.any(Error))
		expect(ctx.writeCssCodegenFile.mock.calls.length - cssWritesBefore)
			.toBe(1)
		expect(ctx.writeTsCodegenFile.mock.calls.length - tsWritesBefore)
			.toBe(2)
	})

	it('logs failed writes queued from watchChange deletions instead of crashing the watcher', async () => {
		const ctx = createCtxStub() as any
		mockCreateCtx.mockReturnValue(ctx)

		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		ctx.writeCssCodegenFile.mockRejectedValueOnce(new Error('css write failed'))
		ctx.writeCssCodegenFile.mockResolvedValue(undefined)

		plugin.watchChange?.('src/demo.ts', { event: 'delete' })
		await flushAsyncWork()

		expect(mockLog.error)
			.toHaveBeenCalledWith(expect.stringContaining('css write failed'), expect.any(Error))
	})

	it('still propagates generated write failures on the awaited transform flush path', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)

		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		ctx.writeCssCodegenFile.mockRejectedValueOnce(new Error('css write failed'))
		ctx.transformImpl = vi.fn(async () => {
			await ctx.hooks.styleUpdated.emit()
			return { code: 'transformed' }
		})

		// The transform handler awaits the flush, so a failed write must fail
		// the build loudly instead of being swallowed.
		await expect(plugin.transform.handler.call({}, 'code', 'src/demo.ts'))
			.rejects.toThrow('css write failed')
	})

	it('re-checks ids with ctx.isTransformTarget before invoking the transform', async () => {
		const ctx = createCtxStub() as any
		// The declarative filter's cwd-relative excludes are baked once against
		// process.cwd(), so an id equal to the codegen output can reach the
		// handler; the call-time re-check must reject it.
		ctx.isTransformTarget = vi.fn((id: string) => id !== '/tmp/pika.gen.css')
		mockCreateCtx.mockReturnValue(ctx)

		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		expect(await plugin.transform.handler.call({}, 'code', '/tmp/pika.gen.css'))
			.toBeNull()
		expect(ctx.transform)
			.not.toHaveBeenCalled()

		expect(await plugin.transform.handler.call({}, 'code', 'src/demo.ts'))
			.toEqual({ code: 'transformed' })
		expect(ctx.transform)
			.toHaveBeenCalledWith('code', 'src/demo.ts')
	})

	it('warns about scanned-but-not-transformed files at buildEnd in build mode only', async () => {
		const ctx = createCtxStub() as any
		ctx.getScannedButNotTransformedFiles = vi.fn(() => ['/app/src/dead.ts'])
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		// Serve mode: never warns.
		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildEnd?.()
		expect(mockLog.warn)
			.not.toHaveBeenCalled()

		// Build mode: waits for idle and warns per file.
		plugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)
		await plugin.buildEnd?.()
		expect(ctx.waitForIdle)
			.toHaveBeenCalled()
		expect(mockLog.warn)
			.toHaveBeenCalledWith(expect.stringContaining('/app/src/dead.ts'))
	})

	it('propagates transform hard errors while keeping the write queue functional', async () => {
		const ctx = createCtxStub() as any
		ctx.transformImpl = vi.fn(async () => {
			throw new Error('[pikacss] Failed to statically evaluate pika() argument')
		})
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')
		const plugin = mod.unpluginFactory(undefined, { framework: 'vite' } as any) as any

		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		await expect(plugin.transform.handler.call({}, 'code', 'src/demo.ts'))
			.rejects.toThrow('Failed to statically evaluate')
		// The idle bookkeeping recovered (finally paths ran), so later queued
		// writes still flush.
		expect(ctx.isIdle)
			.toBe(true)
		ctx.hooks.styleUpdated.listeners.forEach((listener: () => unknown) => listener())
		await flushAsyncWork()
		expect(ctx.writeCssCodegenFile)
			.toHaveBeenCalled()
	})

	it('uses the compiler-supported default scan include unless overridden', async () => {
		const ctx = createCtxStub()
		mockCreateCtx.mockReturnValue(ctx)
		const mod = await import('./index')

		mod.unpluginFactory(undefined, { framework: 'vite' } as any)
		expect(mockCreateCtx)
			.toHaveBeenLastCalledWith(expect.objectContaining({
				scan: expect.objectContaining({
					include: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'],
				}),
			}))

		// An explicit scan.include wins verbatim over the default.
		mod.unpluginFactory({
			scan: { include: ['src/**/*.ts'] },
		}, { framework: 'vite' } as any)
		expect(mockCreateCtx)
			.toHaveBeenLastCalledWith(expect.objectContaining({
				scan: expect.objectContaining({
					include: ['src/**/*.ts'],
				}),
			}))
	})
})
