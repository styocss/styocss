import type { Diagnostic } from '@pikacss/integration'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadFileSync = vi.fn()
const mockWriteFile = vi.fn(async () => {})
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

vi.mock('node:fs/promises', () => ({
	writeFile: mockWriteFile,
}))

// The real console diagnostic handler routes errors to log.error and everything
// else to log.warn (see @pikacss/integration log.ts). The unplugin's neutral
// handler delegates to it for live logging, so the mock mirrors that mapping.
vi.mock('@pikacss/integration', () => ({
	createCtx: mockCreateCtx,
	log: mockLog,
	consoleDiagnosticHandler: (diagnostic: Diagnostic) => {
		const message = `[${diagnostic.code}] ${diagnostic.message}`
		if (diagnostic.level === 'error')
			mockLog.error(message)
		else
			mockLog.warn(message)
	},
}))

vi.mock('perfect-debounce', () => ({
	debounce: mockDebounce,
}))

vi.mock('unplugin', () => ({
	createUnplugin: mockCreateUnplugin,
}))

// The onDiagnostic the factory hands to createCtx. Captured so the transform
// stub can invoke it, mirroring the engine reporting diagnostics from inside
// ctx.transform while the module id is stamped.
let capturedOnDiagnostic: ((diagnostic: Diagnostic) => void) | undefined

function createSyncHook<T>() {
	const listeners: Array<(payload: T) => void> = []
	return {
		listeners,
		on: vi.fn((listener: (payload: T) => void) => {
			listeners.push(listener)
		}),
		trigger(payload: T) {
			listeners.forEach(listener => listener(payload))
		},
	}
}

function createCtxStub() {
	const hooks = {
		styleUpdated: createSyncHook<void>(),
		tsCodegenUpdated: createSyncHook<void>(),
	}
	let activeTransforms = 0
	const stub = {
		cwd: '/app',
		usages: new Map(),
		setup: vi.fn(async () => {
			hooks.styleUpdated.listeners.length = 0
			hooks.tsCodegenUpdated.listeners.length = 0
		}),
		fullyCssCodegen: vi.fn(async () => {}),
		writeCssCodegenFile: vi.fn(async () => {}),
		writeTsCodegenFile: vi.fn(async () => {}),
		// Diagnostics the current transform reports through the captured handler,
		// mirroring the engine emitting them synchronously inside ctx.transform.
		diagnosticsToReport: [] as Diagnostic[],
		transform: vi.fn(async (..._args: any[]) => {
			activeTransforms++
			try {
				for (const diagnostic of stub.diagnosticsToReport)
					capturedOnDiagnostic?.(diagnostic)
				return { code: 'transformed' }
			}
			finally {
				activeTransforms--
			}
		}),
		get isIdle() {
			return activeTransforms === 0
		},
		waitForIdle: vi.fn(() => Promise.resolve()),
		isTransformTarget: vi.fn(() => true),
		dropModule: vi.fn(),
		getScannedButNotTransformedFiles: vi.fn(() => [] as string[]),
		transformFilter: { include: ['src/**/*.ts'], exclude: [] },
		cssCodegenFilepath: '/tmp/pika.gen.css',
		tsCodegenFilepath: '/tmp/pika.gen.ts',
		resolvedConfigPath: null as string | null,
		resolvedConfigContent: 'before',
		hooks,
		engine: { store: { atomicStyleIds: { size: 0 } }, configDependencies: new Set<string>() },
	}
	return stub
}

async function loadFactory(ctx: ReturnType<typeof createCtxStub>) {
	mockCreateCtx.mockImplementation((options: any) => {
		capturedOnDiagnostic = options.onDiagnostic
		return ctx
	})
	const mod = await import('./index')
	return mod.unpluginFactory
}

beforeEach(() => {
	vi.clearAllMocks()
	capturedOnDiagnostic = undefined
	mockReadFileSync.mockReturnValue('before')
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
