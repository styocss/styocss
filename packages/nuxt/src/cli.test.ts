import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runCli } from './cli'

const operations = vi.hoisted(() => ({
	initPikaCSS: vi.fn(),
	preparePikaCSS: vi.fn(),
}))

vi.mock('@pikacss/unplugin-pikacss', () => operations)

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

const initResult = {
	projectRoot: '/nuxt-app',
	configPath: '/nuxt-app/pika.config.ts',
	created: true,
	language: 'typescript' as const,
	moduleMode: 'esm' as const,
	stateDir: '/nuxt-app/.pikacss',
	declarationPath: '/nuxt-app/.pikacss/pika.gen.ts',
	typeProjectFile: 'tsconfig.json' as const,
	generatedStatePath: '.pikacss',
}

const prepareResult = {
	projectRoot: '/nuxt-app',
	selectedConfigPath: null,
	stateDir: '/nuxt-app/.pikacss',
	declarationPath: '/nuxt-app/.pikacss/pika.gen.ts',
	previewPaths: [],
	diagnostics: [],
	entries: [{ fnName: 'pika', cssModule: 'pika.css' }],
}

describe('nuxt package pikacss CLI', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		operations.initPikaCSS.mockResolvedValue(initResult)
		operations.preparePikaCSS.mockResolvedValue(prepareResult)
	})

	it('runs init with the Nuxt directly-installed public-entry identity', async () => {
		const output = createIO()
		await expect(runCli(['init', '--cwd', '/nuxt-app'], output.io)).resolves.toBe(0)
		expect(operations.initPikaCSS)
			.toHaveBeenCalledWith({
				cwd: '/nuxt-app',
				host: { publicEntryModule: '@pikacss/nuxt-pikacss' },
			})
		expect(output.stdout.join(''))
			.toContain('`nuxt prepare` remains the full Nuxt framework preparation lifecycle')
	})

	it('directly runs shared PikaCSS prepare instead of redirecting to nuxt prepare', async () => {
		const output = createIO()
		await expect(runCli(['prepare', '--cwd', '/nuxt-app', '--config', './pika.custom.ts'], output.io)).resolves.toBe(0)
		expect(operations.preparePikaCSS)
			.toHaveBeenCalledWith({
				cwd: '/nuxt-app',
				config: './pika.custom.ts',
				host: { publicEntryModule: '@pikacss/nuxt-pikacss' },
			})
		expect(output.stdout.join(''))
			.toContain('PikaCSS state only')
		expect(output.stdout.join(''))
			.toContain('`nuxt prepare` remains the broader Nuxt framework lifecycle')
	})

	it('rejects --config for init and uses ordinary exit 1', async () => {
		const output = createIO()
		await expect(runCli(['init', '--config', './pika.custom.ts'], output.io)).resolves.toBe(1)
		expect(operations.initPikaCSS).not.toHaveBeenCalled()
		expect(output.stderr.join(''))
			.toContain('only supported by `pikacss prepare`')
	})

	it('returns exit 1 when prepare fails', async () => {
		operations.preparePikaCSS.mockRejectedValue(new Error('nuxt prepare-state failed'))
		const output = createIO()
		await expect(runCli(['prepare'], output.io)).resolves.toBe(1)
		expect(output.stderr.join(''))
			.toContain('nuxt prepare-state failed')
	})
})

describe('nuxt CLI parser/error edges', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		operations.initPikaCSS.mockResolvedValue({ ...initResult, created: false })
		operations.preparePikaCSS.mockResolvedValue({
			...prepareResult,
			diagnostics: [{ level: 'warning', code: 'plain', message: 'plain warning' }],
		})
	})

	it('supports help through default process IO', async () => {
		const stdout = vi.spyOn(process.stdout, 'write')
			.mockImplementation(() => true)
		await expect(runCli(['help'])).resolves.toBe(0)
		expect(stdout)
			.toHaveBeenCalled()
		stdout.mockRestore()
	})

	it('rejects missing/unknown/extra commands', async () => {
		for (const args of [[], ['unknown'], ['prepare', 'extra']] as const) {
			const output = createIO()
			await expect(runCli(args, output.io)).resolves.toBe(1)
			expect(output.stderr.join(''))
				.toMatch(/Missing command|Unknown command|Unexpected argument/)
		}
	})

	it('covers existing init and unlabelled diagnostics', async () => {
		const initialized = createIO()
		await expect(runCli(['init'], initialized.io)).resolves.toBe(0)
		expect(initialized.stdout.join(''))
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
