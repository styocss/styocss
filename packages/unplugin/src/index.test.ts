import type { Diagnostic, EngineConfigDependency, ProductionReportSummary } from '@pikacss/integration'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../_shared/vitest'

const mockCreatePikaCSSContext = vi.fn()
let mockDiagnosticScope: { generationId?: number, moduleId?: string } = {}
const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

vi.mock('@pikacss/integration', () => ({
	createPikaCSSContext: mockCreatePikaCSSContext,
	consoleDiagnosticHandler: vi.fn(),
	getDiagnosticScope: () => mockDiagnosticScope,
	log: mockLog,
	runWithDiagnosticScope: (scope: { generationId?: number, moduleId?: string }, fn: () => unknown) => {
		const previous = mockDiagnosticScope
		mockDiagnosticScope = scope
		try {
			return fn()
		}
		finally {
			mockDiagnosticScope = previous
		}
	},
}))

function createCtxStub(withDependencies = true) {
	const projectDependencies = withDependencies
		? [{ type: 'file' as const, path: '/tmp/pika.config.ts' }]
		: []
	const activation = {
		sourceIds: ['/app/src/demo.ts'],
		cssModules: ['pika.css'],
		runtimeCssFilepaths: ['/tmp/pika-runtime.css'],
	}
	let retained = false
	const optionsAtSetup = () => mockCreatePikaCSSContext.mock.calls.at(-1)?.[0]
	const setup = vi.fn(async () => {
		const options = optionsAtSetup()
		await options?.armDependencies(projectDependencies)
		if (!retained)
			await options?.onActivated?.(activation)
	})
	const context = {
		configErrorBehavior: 'retain-last-good' as 'throw' | 'retain-last-good',
		setup,
		prepareBuild: vi.fn(async () => {}),
		finalizeProductionReports: vi.fn(async () => [] as readonly ProductionReportSummary[]),
		handleHostChange: vi.fn(async (id: string, _change?: { event: 'create' | 'update' | 'delete' }) => {
			if (id === '/tmp/pika.config.ts')
				await setup()
		}),
		transform: vi.fn(async (code: string, id: string) => ({ code: `${code}:${id}` })),
		resolveCssModule: vi.fn(async (id: string) => id === 'pika.css' ? '/tmp/pika-runtime.css' : null),
		waitForIdle: vi.fn(async () => {}),
		getScannedButNotTransformedFiles: vi.fn(() => [] as string[]),
	}
	return {
		context,
		activation,
		projectDependencies,
		setRetained(value: boolean) {
			retained = value
		},
	}
}

function createViteServer() {
	const main = { id: '/app/src/demo.ts', url: '/src/demo.ts' }
	const template = { id: '/app/src/demo.ts?vue&type=template', url: '/src/demo.ts?vue&type=template' }
	return {
		main,
		template,
		server: {
			moduleGraph: {
				getModuleById: vi.fn((id: string) => id.includes('runtime') ? undefined : main),
				getModulesByFile: vi.fn((id: string) => id.includes('demo') ? new Set([main, template]) : undefined),
				invalidateModule: vi.fn(),
			},
			watcher: { add: vi.fn() },
			hot: { send: vi.fn() },
		},
	}
}

function createHostCompiler(mode: 'development' | 'production' = 'production', context?: string) {
	return {
		options: { context, mode },
		hooks: { afterEmit: { tapPromise: vi.fn() } },
	}
}

function createAfterEmitCompiler() {
	const callbacks = [] as Array<(compilation: { errors: readonly unknown[] }) => Promise<void>>
	const compiler = {
		...createHostCompiler(),
		hooks: {
			afterEmit: {
				tapPromise: vi.fn((_name: string, callback: (compilation: { errors: readonly unknown[] }) => Promise<void>) => {
					callbacks.push(callback)
				}),
			},
		},
	}
	return { compiler, callbacks }
}

beforeEach(() => {
	vi.clearAllMocks()
	mockDiagnosticScope = {}
})

describe('unpluginFactory host boundary', () => {
	it('passes only canonical project bootstrap identity to Integration', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory({ config: './config/pika.ts', cwd: '/app' }, { framework: 'vite' } as any) as any
		const vite = createViteServer()
		plugin.vite.configResolved({ root: '/bundler-root', command: 'serve' })
		plugin.vite.configureServer(vite.server)
		const buildContext = { addWatchFile: vi.fn() }
		await plugin.buildStart.call(buildContext)

		const options = mockCreatePikaCSSContext.mock.calls[0]![0]
		expect(Object.keys(options)
			.sort())
			.toEqual([
				'armDependencies',
				'config',
				'mode',
				'onActivated',
				'onDiagnostic',
				'projectRoot',
				'publicEntryModule',
			])
		expect(options.config)
			.toBe('./config/pika.ts')
		expect(options.projectRoot)
			.toBe('/app')
		expect(options.publicEntryModule)
			.toBe('@pikacss/unplugin-pikacss')
		expect(options.mode())
			.toBe('live')
		expect(context.setup)
			.toHaveBeenCalledTimes(1)
		expect(context.prepareBuild).not.toHaveBeenCalled()
		await plugin.buildEnd.call({})
		await plugin.watchChange.call({ addWatchFile: vi.fn() }, '/tmp/pika.config.ts', { event: 'update' })
		expect(context.finalizeProductionReports).not.toHaveBeenCalled()
		expect(buildContext.addWatchFile)
			.toHaveBeenCalledWith('/tmp/pika.config.ts')
	})

	it('uses Integration build preparation and finalizes reports exactly once after Rollup output succeeds', async () => {
		const { context } = createCtxStub()
		context.finalizeProductionReports.mockResolvedValue([{
			entryIndex: 0,
			fnName: 'pika',
			cssModule: 'pika.css',
			domain: 'design-tokens',
			report: {
				totalTokens: 2,
				used: ['--used'],
				unused: ['--unused'],
				deprecatedInUse: [],
				strictViolations: { warning: 0, error: 0 },
			},
			outputPath: '/app/reports/tokens.json',
		}])
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'rollup' } as any) as any
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		expect(mockCreatePikaCSSContext.mock.calls[0]![0].mode())
			.toBe('oneshot')

		await plugin.rollup.buildEnd.call({}, undefined)
		await plugin.rollup.writeBundle.call({ meta: { watchMode: false } })
		await plugin.rollup.writeBundle.call({ meta: { watchMode: false } })

		expect(context.prepareBuild)
			.toHaveBeenCalledTimes(1)
		expect(context.finalizeProductionReports)
			.toHaveBeenCalledTimes(1)
		expect(mockLog.info)
			.toHaveBeenCalledWith('[design-tokens:pika] 2 tokens, 1 used, 1 unused')
		expect(mockLog.info)
			.toHaveBeenCalledWith('[design-tokens:pika] report written to /app/reports/tokens.json')
		expect(Object.keys(context)
			.some(key => key.includes('write')))
			.toBe(false)
	})

	it.each(['vite', 'rollup', 'rolldown'] as const)('suppresses reports after a native %s buildEnd failure', async (framework) => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework } as any) as any
		if (framework === 'vite')
			plugin.vite.configResolved({ root: '/app', command: 'build' })
		await plugin.buildStart.call({ addWatchFile: vi.fn() })

		await plugin[framework].buildEnd.call({}, new Error('external build failure'))
		await plugin[framework].writeBundle.call({ meta: { watchMode: false } })

		expect(context.finalizeProductionReports).not.toHaveBeenCalled()
	})

	it.each(['vite', 'rollup', 'rolldown'] as const)('does not finalize %s reports for watch output', async (framework) => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework } as any) as any
		if (framework === 'vite')
			plugin.vite.configResolved({ root: '/app', command: 'build' })
		await plugin.buildStart.call({ addWatchFile: vi.fn() })

		await plugin[framework].buildEnd.call({}, undefined)
		await plugin[framework].writeBundle.call({ meta: { watchMode: true } })

		expect(context.finalizeProductionReports).not.toHaveBeenCalled()
	})

	it.each(['vite', 'rollup', 'rolldown'] as const)('propagates %s production report rejection from writeBundle', async (framework) => {
		const { context } = createCtxStub()
		context.finalizeProductionReports.mockRejectedValueOnce(new Error('report failure'))
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework } as any) as any
		if (framework === 'vite')
			plugin.vite.configResolved({ root: '/app', command: 'build' })
		await plugin.buildStart.call({ addWatchFile: vi.fn() })

		await plugin[framework].buildEnd.call({}, undefined)
		await expect(plugin[framework].writeBundle.call({ meta: { watchMode: false } })).rejects.toThrow('report failure')
		expect(context.finalizeProductionReports)
			.toHaveBeenCalledTimes(1)
	})

	it.each(['webpack', 'rspack'] as const)('does not finalize production reports after a native %s compilation error', async (framework) => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework } as any) as any
		const { compiler, callbacks } = createAfterEmitCompiler()
		plugin[framework](compiler)
		await plugin.buildStart.call({ addWatchFile: vi.fn() })

		expect(callbacks)
			.toHaveLength(1)
		await callbacks[0]!({ errors: [new Error('external build failure')] })

		expect(context.waitForIdle).not.toHaveBeenCalled()
		expect(context.finalizeProductionReports).not.toHaveBeenCalled()
		expect(mockLog.info).not.toHaveBeenCalled()
	})

	it.each(['webpack', 'rspack'] as const)('finalizes %s reports exactly once through afterEmit', async (framework) => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework } as any) as any
		const { compiler, callbacks } = createAfterEmitCompiler()
		plugin[framework](compiler)
		await plugin.buildStart.call({ addWatchFile: vi.fn() })

		expect(callbacks)
			.toHaveLength(1)
		await callbacks[0]!({ errors: [] })
		await callbacks[0]!({ errors: [] })
		expect(context.finalizeProductionReports)
			.toHaveBeenCalledTimes(1)
	})

	it.each(['webpack', 'rspack'] as const)('finalizes %s reports once through afterEmit and propagates report rejection', async (framework) => {
		const { context } = createCtxStub()
		context.finalizeProductionReports.mockRejectedValueOnce(new Error('report failure'))
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework } as any) as any
		const { compiler, callbacks } = createAfterEmitCompiler()
		plugin[framework](compiler)
		await plugin.buildStart.call({ addWatchFile: vi.fn() })

		expect(callbacks)
			.toHaveLength(1)
		await expect(callbacks[0]!({ errors: [] })).rejects.toThrow('report failure')
		await callbacks[0]!({ errors: [] })
		expect(context.finalizeProductionReports)
			.toHaveBeenCalledTimes(1)
	})

	it('updates an existing context when webpack host mode changes', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'webpack' } as any) as any
		plugin.webpack(createHostCompiler('development'))
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		expect(context.configErrorBehavior)
			.toBe('retain-last-good')
		plugin.webpack(createHostCompiler('development'))
		expect(context.configErrorBehavior)
			.toBe('retain-last-good')
		plugin.webpack(createHostCompiler())
		expect(context.configErrorBehavior)
			.toBe('throw')
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		expect(context.prepareBuild)
			.toHaveBeenCalledTimes(1)
	})

	it('uses process cwd fallbacks for webpack and Rspack host contexts', async () => {
		const webpackContext = createCtxStub(false).context
		mockCreatePikaCSSContext.mockReturnValue(webpackContext)
		const { unpluginFactory } = await import('./index')
		const webpack = unpluginFactory(undefined, { framework: 'webpack' } as any) as any
		webpack.webpack(createHostCompiler())
		await webpack.buildStart.call({ addWatchFile: vi.fn() })
		expect(mockCreatePikaCSSContext.mock.calls[0]![0].projectRoot)
			.toBe(process.cwd())

		const rspackContext = createCtxStub(false).context
		mockCreatePikaCSSContext.mockReturnValue(rspackContext)
		const rspack = unpluginFactory(undefined, { framework: 'rspack' } as any) as any
		rspack.rspack(createHostCompiler())
		await rspack.buildStart.call({ addWatchFile: vi.fn() })
		expect(mockCreatePikaCSSContext.mock.calls.at(-1)![0].projectRoot)
			.toBe(process.cwd())
	})

	it('maps exact logical CSS routes and forwards source transforms', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory({ cwd: '/app' }, { framework: 'vite' } as any) as any
		plugin.vite.configResolved({ root: '/app', command: 'serve' })
		await plugin.resolveId.call({ addWatchFile: vi.fn() }, 'pika.css')
		await plugin.resolveId.call({ addWatchFile: vi.fn() }, 'other.css')
		await plugin.transform.handler.call({ addWatchFile: vi.fn() }, 'const c = pika({ color: \'red\' })', '/app/src/demo.ts')

		expect(context.resolveCssModule)
			.toHaveBeenNthCalledWith(1, 'pika.css')
		expect(context.resolveCssModule)
			.toHaveBeenNthCalledWith(2, 'other.css')
		expect(context.transform)
			.toHaveBeenCalledWith('const c = pika({ color: \'red\' })', '/app/src/demo.ts')
		expect(plugin.transform.filter.id)
			.toEqual({
				include: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'],
				exclude: [],
			})
	})

	it('arms native watchers monotonically and forwards every host event to Integration', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'vite' } as any) as any
		const vite = createViteServer()
		plugin.vite.configResolved({ root: '/app', command: 'serve' })
		plugin.vite.configureServer(vite.server)
		const buildContext = { addWatchFile: vi.fn() }
		await plugin.buildStart.call(buildContext)
		await plugin.watchChange.call({ addWatchFile: vi.fn() }, '/untracked/file.json', { event: 'update' })
		await plugin.watchChange.call({ addWatchFile: vi.fn() }, '/tmp/pika.config.ts', { event: 'update' })

		expect(context.handleHostChange)
			.toHaveBeenNthCalledWith(1, '/untracked/file.json', { event: 'update' })
		expect(context.handleHostChange)
			.toHaveBeenNthCalledWith(2, '/tmp/pika.config.ts', { event: 'update' })
		expect(vite.server.watcher.add)
			.toHaveBeenCalledTimes(1)
		expect(context.setup)
			.toHaveBeenCalledTimes(2)
	})

	it('maps Integration activation effects to every Vite module variant and reloads once', async () => {
		const { context, activation } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'vite' } as any) as any
		const vite = createViteServer()
		plugin.vite.configResolved({ root: '/app', command: 'serve' })
		plugin.vite.configureServer(vite.server)
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		activation.runtimeCssFilepaths.push('/tmp/runtime-next.css')
		await plugin.watchChange.call({ addWatchFile: vi.fn() }, '/tmp/pika.config.ts', { event: 'update' })

		expect(vite.server.moduleGraph.invalidateModule)
			.toHaveBeenCalledWith(vite.main)
		expect(vite.server.moduleGraph.invalidateModule)
			.toHaveBeenCalledWith(vite.template)
		expect(vite.server.hot.send)
			.toHaveBeenCalledWith({ type: 'full-reload' })
	})

	it('maps replacement activation to the Rspack watcher', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'rspack' } as any) as any
		const watching = {
			invalidateWithChangesAndRemovals: vi.fn(),
			invalidate: vi.fn(),
		}
		plugin.rspack({ ...createHostCompiler('development'), watching })
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		await plugin.watchChange.call({ addWatchFile: vi.fn() }, '/tmp/pika.config.ts', { event: 'update' })

		expect(watching.invalidateWithChangesAndRemovals)
			.toHaveBeenCalledWith(new Set(['/app/src/demo.ts']))
		expect(watching.invalidate)
			.toHaveBeenCalledTimes(1)
	})

	it('skips an Rspack compiler that is not in watch mode', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'rspack' } as any) as any
		const watching = {
			invalidateWithChangesAndRemovals: vi.fn(),
			invalidate: vi.fn(),
		}
		plugin.rspack({ ...createHostCompiler('development'), watching })
		plugin.rspack(createHostCompiler('development'))
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		await plugin.watchChange.call({ addWatchFile: vi.fn() }, '/tmp/pika.config.ts', { event: 'update' })
		expect(watching.invalidate)
			.toHaveBeenCalledTimes(1)
	})

	it('rejects live dependency arming when no watcher is available', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved({ root: '/app', command: 'serve' })
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		const armDependencies = mockCreatePikaCSSContext.mock.calls[0]![0].armDependencies as (dependencies: readonly EngineConfigDependency[]) => void
		expect(() => armDependencies([{ type: 'file', path: '/tmp/another-config.ts' }]))
			.toThrow('live host watcher')
	})

	it('presents Integration readiness warnings and closes a build without a generation safely', async () => {
		const { context } = createCtxStub()
		context.getScannedButNotTransformedFiles.mockReturnValue(['/app/src/dead.ts'])
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved({ root: '/app', command: 'build' })
		await plugin.buildEnd.call({})
		expect(mockLog.warn)
			.toHaveBeenCalledWith(expect.stringContaining('/app/src/dead.ts'))
	})

	it('invalidates custom Vite environments during activation replacement', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'vite' } as any) as any
		const vite = createViteServer()
		const custom = { id: '/app/src/demo.ts', url: '/edge/demo.ts' }
		const invalidateModule = vi.fn()
		;(vite.server as any).environments = {
			client: {},
			edge: {
				moduleGraph: {
					getModulesByFile: vi.fn(() => new Set([custom])),
					getModuleById: vi.fn(() => custom),
					invalidateModule,
				},
			},
		}
		plugin.vite.configResolved({ root: '/app', command: 'serve' })
		plugin.vite.configureServer(vite.server)
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		await plugin.watchChange.call({ addWatchFile: vi.fn() }, '/tmp/pika.config.ts', { event: 'update' })
		expect(invalidateModule)
			.toHaveBeenCalledWith(custom)
	})

	it('collects build diagnostics and fails at buildEnd without a report hook', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved({ root: '/app', command: 'build' })
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		const onDiagnostic = mockCreatePikaCSSContext.mock.calls[0]![0].onDiagnostic as (diagnostic: Diagnostic) => void
		mockDiagnosticScope = { generationId: 1 }
		onDiagnostic({ level: 'error', code: 'PIKA_TEST', message: 'bad source', plugin: 'test' })
		mockDiagnosticScope = {}
		await expect(plugin.buildEnd.call({})).rejects.toThrow('PIKA_TEST')
	})

	it('keeps the host root immutable after context creation', async () => {
		const { context } = createCtxStub()
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved({ root: '/first', command: 'serve' })
		await plugin.buildStart.call({ addWatchFile: vi.fn() })
		expect(() => plugin.vite.configResolved({ root: '/second', command: 'serve' }))
			.toThrow('project root is immutable')
	})

	it('does not clear a newer watcher registrar when cold setup finishes late', async () => {
		const { context } = createCtxStub(false)
		const setupGate = createDeferred()
		context.setup.mockImplementation(async () => setupGate.promise)
		mockCreatePikaCSSContext.mockReturnValue(context)
		const { unpluginFactory } = await import('./index')
		const plugin = unpluginFactory(undefined, { framework: 'vite' } as any) as any
		const firstHost = { addWatchFile: vi.fn() }
		const build = plugin.buildStart.call(firstHost)
		await Promise.resolve()
		await plugin.watchChange.call({ addWatchFile: vi.fn() }, '/not-a-dependency', { event: 'update' })
		setupGate.resolve()
		await build
	})
})
