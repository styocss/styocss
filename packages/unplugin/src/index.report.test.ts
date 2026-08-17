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

vi.mock('@pikacss/integration', () => ({
	createCtx: mockCreateCtx,
	log: mockLog,
	getDiagnosticScope: () => ({}),
	runWithDiagnosticScope: (_scope: any, fn: () => any) => fn(),
	consoleDiagnosticHandler: vi.fn(),
}))

vi.mock('perfect-debounce', () => ({
	debounce: mockDebounce,
}))

vi.mock('unplugin', () => ({
	createUnplugin: mockCreateUnplugin,
}))

const SAMPLE_REPORT = {
	totalTokens: 5,
	used: ['--color-accent', '--color-primary'],
	unused: ['--color-unused'],
	deprecatedInUse: ['--color-legacy'],
	strictViolations: { warning: 2, error: 1 },
}

// A ctx stub exposing the design-tokens report surface on its engine, mirroring
// the augmentation `@pikacss/plugin-design-tokens` adds at runtime.
function createCtxStub(reportFn?: () => typeof SAMPLE_REPORT) {
	const designTokens = reportFn == null ? undefined : { report: reportFn }
	return {
		cwd: '/app',
		usages: new Map(),
		setup: vi.fn(async () => {}),
		fullyCssCodegen: vi.fn(async () => {}),
		writeCssCodegenFile: vi.fn(async () => {}),
		writeTsCodegenFile: vi.fn(async () => {}),
		transform: vi.fn(async () => ({ code: 'transformed' })),
		get isIdle() {
			return true
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
		hooks: {
			styleUpdated: { on: vi.fn() },
			tsCodegenUpdated: { on: vi.fn() },
			dependencyAdded: { on: vi.fn() },
		},
		engine: {
			store: { atomicStyleIds: { size: 0 } },
			configDependencies: new Set<string>(),
			designTokens,
		},
	}
}

// Drives a factory through a full production build up to and including buildEnd.
async function runBuild(options: any, ctx: ReturnType<typeof createCtxStub>) {
	mockCreateCtx.mockReturnValue(ctx)
	const mod = await import('./index')
	const plugin = mod.unpluginFactory(options, { framework: 'vite' } as any) as any
	plugin.vite.configResolved?.({ root: '/app', command: 'build' } as any)
	await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
	await plugin.buildEnd.call({} as any)
	return plugin
}

beforeEach(() => {
	vi.clearAllMocks()
	mockReadFileSync.mockReturnValue('before')
})

describe('unpluginFactory report option', () => {
	it('logs a summary at build end when report is true', async () => {
		await runBuild({ report: true }, createCtxStub(() => SAMPLE_REPORT))

		expect(mockLog.info)
			.toHaveBeenCalledWith('[design-tokens] 5 tokens, 2 used, 1 unused')
		expect(mockLog.info)
			.toHaveBeenCalledWith('[design-tokens] 1 deprecated in use, 1 strict error(s), 2 strict warning(s)')
		expect(mockWriteFile)
			.not.toHaveBeenCalled()
	})

	it('also writes the full report JSON when an output path is given', async () => {
		await runBuild({ report: { output: 'report.json' } }, createCtxStub(() => SAMPLE_REPORT))

		expect(mockWriteFile)
			.toHaveBeenCalledTimes(1)
		const [path, contents, encoding] = mockWriteFile.mock.calls[0] as unknown as [string, string, string]
		expect(path)
			.toBe('/app/report.json')
		expect(encoding)
			.toBe('utf-8')
		expect(JSON.parse(contents))
			.toEqual(SAMPLE_REPORT)
		expect(mockLog.info)
			.toHaveBeenCalledWith('[design-tokens] report written to /app/report.json')
	})

	it('does nothing when report is unset (zero behavior change)', async () => {
		await runBuild(undefined, createCtxStub(() => SAMPLE_REPORT))

		expect(mockLog.info)
			.not.toHaveBeenCalledWith(expect.stringContaining('[design-tokens]'))
		expect(mockWriteFile)
			.not.toHaveBeenCalled()
	})

	it('is a no-op when the design-tokens plugin surface is absent', async () => {
		await runBuild({ report: true }, createCtxStub(undefined))

		expect(mockLog.info)
			.not.toHaveBeenCalledWith(expect.stringContaining('[design-tokens]'))
		expect(mockWriteFile)
			.not.toHaveBeenCalled()
		expect(mockLog.debug)
			.toHaveBeenCalledWith('Design-token report requested, but no design-tokens plugin surface is present.')
	})

	it('does not report in dev-server (serve) mode', async () => {
		mockCreateCtx.mockReturnValue(createCtxStub(() => SAMPLE_REPORT))
		const mod = await import('./index')
		const plugin = mod.unpluginFactory({ report: true }, { framework: 'vite' } as any) as any
		plugin.vite.configResolved?.({ root: '/app', command: 'serve' } as any)
		await plugin.buildStart.call({ addWatchFile: vi.fn() } as any)
		await plugin.buildEnd.call({} as any)

		expect(mockLog.info)
			.not.toHaveBeenCalledWith(expect.stringContaining('[design-tokens]'))
		expect(mockWriteFile)
			.not.toHaveBeenCalled()
	})
})
