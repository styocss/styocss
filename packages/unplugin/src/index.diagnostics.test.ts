import type { Diagnostic } from '@pikacss/integration'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreatePikaCSSContext = vi.fn()
const mockLog = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

// The real console diagnostic handler routes errors to log.error and everything
// else to log.warn (see @pikacss/integration log.ts). The unplugin's neutral
// handler delegates to it for live logging, so the mock mirrors that mapping.
// The real async-scope primitives are captured out of the factory so the ctx
// stub can attribute per-module work exactly like the real integration —
// generation/module attribution semantics are what these tests exercise.
const scopeFns = vi.hoisted(() => ({
	run: null as unknown as <T>(scope: any, fn: () => T) => T,
}))

vi.mock('@pikacss/integration', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@pikacss/integration')>()
	scopeFns.run = actual.runWithDiagnosticScope
	return {
		getDiagnosticScope: actual.getDiagnosticScope,
		runWithDiagnosticScope: actual.runWithDiagnosticScope,
		createPikaCSSContext: mockCreatePikaCSSContext,
		log: mockLog,
		consoleDiagnosticHandler: (diagnostic: Diagnostic) => {
			const message = `[${diagnostic.code}] ${diagnostic.message}`
			if (diagnostic.level === 'error')
				mockLog.error(message)
			else
				mockLog.warn(message)
		},
	}
})

// The onDiagnostic the factory hands to createPikaCSSContext. Captured so the transform
// stub can invoke it, mirroring the engine reporting diagnostics from inside
// ctx.transform while the module id is stamped.
let capturedOnDiagnostic: ((diagnostic: Diagnostic) => void) | undefined

async function flushAsyncWork() {
	await Promise.resolve()
	await Promise.resolve()
	await new Promise<void>(resolve => setImmediate(resolve))
}

function createCtxStub() {
	const stub = {
		cwd: '/app',
		usages: new Map(),
		projectDependencies: [{ type: 'file' as const, path: '/tmp/pika.config.ts' }],
		setup: vi.fn(async () => {
			const host = mockCreatePikaCSSContext.mock.calls.at(-1)?.[0]
			await host?.armDependencies(stub.projectDependencies)
			await host?.onActivated?.({
				sourceIds: [...stub.usages.keys()],
				cssModules: ['pika.css'],
				runtimeCssFilepaths: ['/tmp/pika-runtime.css'],
			})
		}),
		prepareBuild: vi.fn(async () => {}),
		finalizeProductionReports: vi.fn(async () => []),
		handleHostChange: vi.fn(async () => {
			await stub.setup()
		}),
		// Diagnostics the current transform reports through the captured handler,
		// mirroring the engine emitting them synchronously inside ctx.transform.
		diagnosticsToReport: [] as Diagnostic[],
		transform: vi.fn(async (...args: any[]) => {
			// Mirror the real integration: per-module work carries module
			// attribution via async scope (#115).
			return scopeFns.run({ moduleId: String(args[1]) }, async () => {
				for (const diagnostic of stub.diagnosticsToReport)
					capturedOnDiagnostic?.(diagnostic)
				return { code: 'transformed' }
			})
		}),
		waitForIdle: vi.fn(() => Promise.resolve()),
		resolveCssModule: vi.fn(async (id: string) => id === 'pika.css' ? '/tmp/pika.gen.css' : null),
		dropModule: vi.fn(),
		getScannedButNotTransformedFiles: vi.fn(() => [] as string[]),
	}
	return stub
}

async function loadFactory(ctx: ReturnType<typeof createCtxStub>) {
	mockCreatePikaCSSContext.mockImplementation((options: any) => {
		capturedOnDiagnostic = options.onDiagnostic
		return ctx
	})
	const mod = await import('./index')
	return mod.unpluginFactory
}

beforeEach(() => {
	vi.clearAllMocks()
	capturedOnDiagnostic = undefined
})

describe('unpluginFactory diagnostics', () => {
	it('collects error-level diagnostics and fails the build once at buildEnd', async () => {
		const ctx = createCtxStub()
		ctx.diagnosticsToReport = [{
			level: 'error',
			code: 'unknown-token',
			message: 'Unknown token "--nope"',
			plugin: 'design-tokens',
		}]
		const factory = await loadFactory(ctx)
		const plugin = factory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		// The transform itself does not throw — the engine only collects the error.
		await expect(plugin.transform.handler.call({}, 'code', 'src/demo.ts'))
			.resolves
			.toEqual({ code: 'transformed' })
		// The diagnostic was logged live through the console handler.
		expect(mockLog.error)
			.toHaveBeenCalledWith('[unknown-token] Unknown token "--nope"')

		// buildEnd aggregates the error, attributing it to the producing module.
		await expect(plugin.buildEnd.call({} as any))
			.rejects
			.toThrow('PikaCSS reported 1 error diagnostic(s):')
		await expect(plugin.buildEnd.call({} as any))
			.rejects
			.toThrow('[design-tokens] unknown-token (src/demo.ts): Unknown token "--nope"')
	})

	it('recovers across watch rebuilds: a later clean generation is not poisoned (#115)', async () => {
		const ctx = createCtxStub()
		ctx.diagnosticsToReport = [{
			level: 'error',
			code: 'unknown-token',
			message: 'Unknown token "--nope"',
			plugin: 'design-tokens',
		}]
		const factory = await loadFactory(ctx)
		const plugin = factory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)

		// Generation 1: emits an error, build fails.
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		await plugin.transform.handler.call({}, 'code', 'src/demo.ts')
		await expect(plugin.buildEnd.call({} as any))
			.rejects
			.toThrow('PikaCSS reported 1 error diagnostic(s):')

		// Source/config fixed: generation 2 emits nothing and must succeed —
		// the previous generation's errors may not leak forward.
		ctx.diagnosticsToReport = []
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		await plugin.transform.handler.call({}, 'code', 'src/demo.ts')
		await expect(plugin.buildEnd.call({} as any))
			.resolves
			.toBeUndefined()
	})

	it('logs a stale generation\'s late diagnostic without poisoning the newer generation (#115)', async () => {
		const ctx = createCtxStub()
		const factory = await loadFactory(ctx)
		const plugin = factory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)

		// A transform started for generation 1 suspends mid-flight.
		let releaseSuspended: () => void
		const suspended = new Promise<void>((resolve) => {
			releaseSuspended = resolve
		})
		ctx.transform = vi.fn(async (..._args: any[]) => scopeFns.run({ moduleId: 'src/slow.ts' }, async () => {
			await suspended
			capturedOnDiagnostic?.({
				level: 'error',
				code: 'late-error',
				message: 'emitted after the next generation started',
				plugin: 'design-tokens',
			} as Diagnostic)
			return { code: 'transformed' }
		}))

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		const inFlight = plugin.transform.handler.call({}, 'code', 'src/slow.ts')

		// Generation 2 begins; only then does the stale work emit its error.
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		releaseSuspended!()
		await inFlight

		// The late diagnostic logged live but never entered generation 2.
		expect(mockLog.error)
			.toHaveBeenCalledWith('[late-error] emitted after the next generation started')
		await expect(plugin.buildEnd.call({} as any))
			.resolves
			.toBeUndefined()
	})

	it('attributes interleaved concurrent transforms to their own modules (#115)', async () => {
		const ctx = createCtxStub()
		const factory = await loadFactory(ctx)
		const plugin = factory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)

		const gates = new Map<string, { promise: Promise<void>, resolve: () => void }>()
		for (const id of ['src/a.ts', 'src/b.ts']) {
			let resolve!: () => void
			const promise = new Promise<void>((_resolve) => {
				resolve = _resolve
			})
			gates.set(id, { promise, resolve })
		}
		ctx.transform = vi.fn(async (_code: any, id: any) => scopeFns.run({ moduleId: String(id) }, async () => {
			await gates.get(String(id))!.promise
			capturedOnDiagnostic?.({
				level: 'error',
				code: `error-from-${String(id)
					.replace(/\W+/g, '-')}`,
				message: 'boom',
				plugin: 'test',
			} as Diagnostic)
			return { code: 'transformed' }
		}))

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		// A starts and suspends; B starts, emits, and finishes first; A then
		// resumes and emits. Attribution must not leak between them.
		const transformA = plugin.transform.handler.call({}, 'code', 'src/a.ts')
		const transformB = plugin.transform.handler.call({}, 'code', 'src/b.ts')
		gates.get('src/b.ts')!.resolve()
		await transformB
		gates.get('src/a.ts')!.resolve()
		await transformA

		await expect(plugin.buildEnd.call({} as any))
			.rejects
			.toThrow('error-from-src-a-ts (src/a.ts)')
		ctx.diagnosticsToReport = []
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		await expect(plugin.buildEnd.call({} as any))
			.resolves
			.toBeUndefined()
	})

	it('collects config-reload diagnostics into the generation that triggered the reload (#115)', async () => {
		const ctx = createCtxStub()
		const factory = await loadFactory(ctx)
		const plugin = factory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)

		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		// The config file changes mid-generation; the reload's setup emits an
		// error diagnostic (e.g. a plugin configureEngine failure).
		ctx.setup = vi.fn(async () => {
			// Deliberately plugin-less and module-less: the aggregate line for a
			// project-level diagnostic has neither a `[plugin]` prefix nor a
			// `(module)` suffix.
			capturedOnDiagnostic?.({
				level: 'error',
				code: 'bad-config',
				message: 'configureEngine exploded',
			} as Diagnostic)
		})
		plugin.watchChange?.call({ addWatchFile: vi.fn() }, '/tmp/pika.config.ts', { event: 'update' })
		await flushAsyncWork()

		// The reload error belongs to the still-open generation and fails it —
		// as a project-level diagnostic: generation-scoped but with no module
		// attribution, so the aggregate line carries no `(module)` suffix.
		await expect(plugin.buildEnd.call({} as any))
			.rejects
			.toThrow('  - bad-config: configureEngine exploded')
	})

	it('logs warning-level diagnostics live and never fails the build', async () => {
		const ctx = createCtxStub()
		ctx.diagnosticsToReport = [{
			level: 'warning',
			code: 'deprecated-token',
			message: 'Deprecated token',
			plugin: 'design-tokens',
		}]
		const factory = await loadFactory(ctx)
		const plugin = factory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		await expect(plugin.transform.handler.call({}, 'code', 'src/demo.ts'))
			.resolves
			.toEqual({ code: 'transformed' })
		expect(mockLog.warn)
			.toHaveBeenCalledWith('[deprecated-token] Deprecated token')

		await expect(plugin.buildEnd.call({} as any))
			.resolves
			.toBeUndefined()
	})

	it('does not fail the dev server on error-level diagnostics (logs live only)', async () => {
		const ctx = createCtxStub()
		ctx.diagnosticsToReport = [{
			level: 'error',
			code: 'unknown-token',
			message: 'Unknown token',
			plugin: 'design-tokens',
		}]
		const factory = await loadFactory(ctx)
		const plugin = factory(undefined, { framework: 'vite' } as any) as any
		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)

		await expect(plugin.transform.handler.call({}, 'code', 'src/demo.ts'))
			.resolves
			.toEqual({ code: 'transformed' })
		expect(mockLog.error)
			.toHaveBeenCalledWith('[unknown-token] Unknown token')

		// buildEnd returns early in serve mode, so the collected error never throws.
		await expect(plugin.buildEnd.call({} as any))
			.resolves
			.toBeUndefined()
	})
})
