import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runCli } from './cli'

const operations = vi.hoisted(() => ({
	initPikaCSS: vi.fn(),
	preparePikaCSS: vi.fn(),
}))

vi.mock('@pikacss/integration', () => operations)

function createIO() {
	const stdout: string[] = []
	const stderr: string[] = []
	return {
		stdout,
		stderr,
		io: {
			stdout: (text: string) => stdout.push(text),
			stderr: (text: string) => stderr.push(text),
		},
	}
}

function initResult(created = true) {
	return {
		projectRoot: '/app',
		configPath: '/app/pika.config.ts',
		created,
		language: 'typescript' as const,
		moduleMode: 'esm' as const,
		stateDir: '/app/.pikacss',
		declarationPath: '/app/.pikacss/pika.gen.ts',
		typeProjectFile: 'tsconfig.json' as const,
		generatedStatePath: '.pikacss',
	}
}

function prepareResult() {
	return {
		projectRoot: '/app',
		selectedConfigPath: '/app/custom.ts',
		stateDir: '/app/.pikacss',
		declarationPath: '/app/.pikacss/pika.gen.ts',
		previewPaths: [],
		diagnostics: [{ level: 'warning', code: 'preview', message: 'preview unavailable', plugin: 'icons' }],
		entries: [{ fnName: 'pika', cssModule: 'pika.css' }],
	}
}

describe('unplugin package pikacss CLI', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		operations.initPikaCSS.mockResolvedValue(initResult())
		operations.preparePikaCSS.mockResolvedValue(prepareResult())
	})

	it('runs init through Integration with the unplugin public-entry identity', async () => {
		const output = createIO()
		await expect(runCli(['init', '--cwd', '/app'], output.io)).resolves.toBe(0)
		expect(operations.initPikaCSS)
			.toHaveBeenCalledWith({
				cwd: '/app',
				host: { publicEntryModule: '@pikacss/unplugin-pikacss' },
			})
		expect(operations.preparePikaCSS).not.toHaveBeenCalled()
		expect(output.stdout.join(''))
			.toContain('/app/pika.config.ts')
	})

	it('runs prepare through Integration with cwd/config and reports non-fatal diagnostics', async () => {
		const output = createIO()
		await expect(runCli(['prepare', '--cwd', '/app', '--config', './custom.ts'], output.io)).resolves.toBe(0)
		expect(operations.preparePikaCSS)
			.toHaveBeenCalledWith({
				cwd: '/app',
				config: './custom.ts',
				host: { publicEntryModule: '@pikacss/unplugin-pikacss' },
			})
		expect(output.stderr.join(''))
			.toContain('warning [icons] preview: preview unavailable')
		expect(output.stdout.join(''))
			.toContain('/app/.pikacss/pika.gen.ts')
	})

	it('keeps --config scoped to prepare', async () => {
		const output = createIO()
		await expect(runCli(['init', '--config', './custom.ts'], output.io)).resolves.toBe(1)
		expect(operations.initPikaCSS).not.toHaveBeenCalled()
		expect(output.stderr.join(''))
			.toContain('only supported by `pikacss prepare`')
	})

	it('uses ordinary exit 1 when the shared operation rejects', async () => {
		operations.preparePikaCSS.mockRejectedValue(new Error('prepare failed'))
		const output = createIO()
		await expect(runCli(['prepare'], output.io)).resolves.toBe(1)
		expect(output.stderr.join(''))
			.toContain('prepare failed')
	})

	it('prints narrow command help without running semantic operations', async () => {
		const output = createIO()
		await expect(runCli(['--help'], output.io)).resolves.toBe(0)
		expect(output.stdout.join(''))
			.toContain('pikacss prepare [--cwd <dir>] [--config <file>]')
		expect(operations.initPikaCSS).not.toHaveBeenCalled()
		expect(operations.preparePikaCSS).not.toHaveBeenCalled()
	})
})

describe('unplugin CLI parser/error edges', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		operations.initPikaCSS.mockResolvedValue(initResult(false))
		operations.preparePikaCSS.mockResolvedValue({ ...prepareResult(), diagnostics: [{ level: 'warning', code: 'plain', message: 'plain warning' }] })
	})

	it('supports the help command form and default process IO', async () => {
		const stdout = vi.spyOn(process.stdout, 'write')
			.mockImplementation(() => true)
		await expect(runCli(['help'])).resolves.toBe(0)
		expect(stdout)
			.toHaveBeenCalled()
		stdout.mockRestore()
	})

	it('reports missing/unknown/extra positional commands', async () => {
		for (const args of [[], ['unknown'], ['prepare', 'extra']] as const) {
			const output = createIO()
			await expect(runCli(args, output.io)).resolves.toBe(1)
			expect(output.stderr.join(''))
				.toMatch(/Missing command|Unknown command|Unexpected argument/)
		}
	})

	it('covers existing init without cwd and diagnostics without plugin labels', async () => {
		const output = createIO()
		await expect(runCli(['init'], output.io)).resolves.toBe(0)
		expect(operations.initPikaCSS)
			.toHaveBeenCalledWith({
				host: { publicEntryModule: '@pikacss/unplugin-pikacss' },
			})
		expect(output.stdout.join(''))
			.toContain('Using existing PikaCSS config')

		const prepared = createIO()
		await expect(runCli(['prepare'], prepared.io)).resolves.toBe(0)
		expect(prepared.stderr.join(''))
			.toContain('warning plain: plain warning')
	})

	it('formats non-Error rejections through default stderr IO', async () => {
		operations.preparePikaCSS.mockRejectedValue('string failure')
		const stderr = vi.spyOn(process.stderr, 'write')
			.mockImplementation(() => true)
		await expect(runCli(['prepare'])).resolves.toBe(1)
		expect(stderr)
			.toHaveBeenCalledWith(expect.stringContaining('string failure'))
		stderr.mockRestore()
	})
})
