import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { initPikaCSS, inspectPikaCSSProject, preparePikaCSS } from './operations'

const created: string[] = []
const defineConfigPath = new URL('../../config/src/index.ts', import.meta.url).pathname

async function createRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'pikacss-operations-'))
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

afterEach(async () => {
	await Promise.all(created.splice(0)
		.map(path => rm(path, { recursive: true, force: true })))
})

describe('inspectPikaCSSProject (#153)', () => {
	it('uses process.cwd() and canonical default single authoring without creating generated state', async () => {
		const root = await createRoot()
		const previous = process.cwd()
		process.chdir(root)
		try {
			const result = await inspectPikaCSSProject()
			expect(result)
				.toEqual({
					projectRoot: root,
					selectedConfigPath: null,
					authoringForm: 'single',
					entries: [{ fnName: 'pika', cssModule: 'pika.css' }],
				})
			expect(await readdir(root))
				.toEqual([])
		}
		finally {
			process.chdir(previous)
		}
	})

	it('honors an explicit closed config selector and preserves explicit multi authoring form/order', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`export default defineConfig({ fnName: 'ignored' })`))
		await write(join(root, 'config/project.ts'), configSource(`
			export default defineConfig([
				{ fnName: 'site', cssModule: 'site.css' },
				{ fnName: 'admin', cssModule: 'admin.css' },
			])
		`))

		const result = await inspectPikaCSSProject({ cwd: root, config: './config/project.ts' })

		expect(result.projectRoot)
			.toBe(root)
		expect(result.selectedConfigPath)
			.toBe(join(root, 'config/project.ts'))
		expect(result.authoringForm)
			.toBe('multi')
		expect(result.entries)
			.toEqual([
				{ fnName: 'site', cssModule: 'site.css' },
				{ fnName: 'admin', cssModule: 'admin.css' },
			])
		expect(Object.isFrozen(result))
			.toBe(true)
		expect(Object.isFrozen(result.entries))
			.toBe(true)
	})
})

describe('preparePikaCSS (#150)', () => {
	it('publishes default Typegen without scanning source or generating runtime CSS', async () => {
		const root = await createRoot()
		await write(join(root, 'src/broken.ts'), `export const nope = pika(dynamicValue()) + 'unterminated`)

		const result = await preparePikaCSS({
			cwd: root,
			host: { publicEntryModule: '@consumer/pikacss', previewHref: path => `host:${path}` },
		})
		const content = await readFile(result.declarationPath, 'utf8')

		expect(result.selectedConfigPath)
			.toBeNull()
		expect(result.stateDir)
			.toBe(join(root, '.pikacss'))
		expect(result.declarationPath)
			.toBe(join(root, '.pikacss/pika.gen.ts'))
		expect(content)
			.toContain('import("@consumer/pikacss")')
		expect(content)
			.toContain('const pika: __PikaTypegenUnit0.Pika')
		expect(await readdir(result.stateDir))
			.not.toContain('runs')
	})

	it('does not run production reports during prepare', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`
			export default defineConfig({
				report: true,
				engine: {
					plugins: [{
						name: 'test:prepare-no-report',
						configureEngine(configurator) {
							configurator.runtime.designTokens = {
								report() { throw new Error('production report ran during prepare') },
							}
						},
					}],
				},
			})
		`))

		await expect(preparePikaCSS({
			cwd: root,
			host: { publicEntryModule: '@consumer/pikacss' },
		})).resolves.toMatchObject({
			projectRoot: root,
			entries: [{ fnName: 'pika', cssModule: 'pika.css' }],
		})
	})

	it('uses process.cwd() when the standalone caller omits cwd', async () => {
		const root = await createRoot()
		const previous = process.cwd()
		process.chdir(root)
		try {
			const prepared = await preparePikaCSS({ host: { publicEntryModule: '@consumer/pikacss' } })
			expect(prepared.projectRoot)
				.toBe(root)

			const initialized = await initPikaCSS({ host: { publicEntryModule: '@consumer/pikacss' } })
			expect(initialized.projectRoot)
				.toBe(root)
		}
		finally {
			process.chdir(previous)
		}
	})

	it('composes multi-entry Typegen deterministically in config order', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`
			export default defineConfig([
				{ fnName: 'site', cssModule: 'site.css' },
				{ fnName: 'admin', cssModule: 'admin.css', transformedFormat: 'array' },
			])
		`))

		const result = await preparePikaCSS({ cwd: root, host: { publicEntryModule: '@consumer/pikacss' } })
		const content = await readFile(result.declarationPath, 'utf8')

		expect(result.entries)
			.toEqual([
				{ fnName: 'site', cssModule: 'site.css' },
				{ fnName: 'admin', cssModule: 'admin.css' },
			])
		expect(content.indexOf('const site: __PikaTypegenUnit0.Pika'))
			.toBeLessThan(content.indexOf('const admin: __PikaTypegenUnit1.Pika'))
		expect(content)
			.toContain('type __StyleFn = (...params: __StyleItem[]) => string[]')
	})

	it('honors an explicit relative config selector without falling back to root discovery', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`export default defineConfig({ fnName: 'ignoredRoot' })`))
		await write(join(root, 'config/custom.cts'), configSource(`export default defineConfig({ fnName: 'selected' })`))

		const result = await preparePikaCSS({
			cwd: root,
			config: 'config/custom.cts',
			host: { publicEntryModule: '@consumer/pikacss' },
		})

		expect(result.selectedConfigPath)
			.toBe(join(root, 'config/custom.cts'))
		expect(result.entries[0]?.fnName)
			.toBe('selected')
	})

	it('applies host defaultStateDir only when config does not provide one', async () => {
		const root = await createRoot()
		const hostDefault = join(root, '.host-state')
		let result = await preparePikaCSS({
			cwd: root,
			host: { publicEntryModule: '@consumer/pikacss', defaultStateDir: hostDefault },
		})
		expect(result.stateDir)
			.toBe(hostDefault)

		result = await preparePikaCSS({
			cwd: root,
			host: { publicEntryModule: '@consumer/pikacss', defaultStateDir: '.relative-host-state' },
		})
		expect(result.stateDir)
			.toBe(join(root, '.relative-host-state'))

		await write(join(root, 'pika.config.ts'), configSource(`export default defineConfig({ stateDir: '../shared-state' })`))
		result = await preparePikaCSS({
			cwd: root,
			host: { publicEntryModule: '@consumer/pikacss', defaultStateDir: hostDefault },
		})
		expect(result.stateDir)
			.toBe(join(dirname(root), 'shared-state'))
	})

	it('returns non-fatal diagnostics while optionally streaming the same diagnostics to the host', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`
			export default defineConfig({
				engine: {
					plugins: [{
						name: 'test:prepare-warning',
						configureEngine(configurator) {
							configurator.onDiagnostic({
								level: 'warning',
								code: 'test-prepare-warning',
								message: 'warning from prepare',
							})
						},
					}],
				},
			})
		`))
		const streamed: unknown[] = []

		const result = await preparePikaCSS({
			cwd: root,
			host: { publicEntryModule: '@consumer/pikacss' },
			onDiagnostic: diagnostic => streamed.push(diagnostic),
		})

		expect(result.diagnostics)
			.toEqual([expect.objectContaining({
				level: 'warning',
				code: 'test-prepare-warning',
			})])
		expect(streamed)
			.toEqual(result.diagnostics)
		expect(Object.isFrozen(result.diagnostics))
			.toBe(true)
	})

	it('hard-fails semantic derivation without replacing an existing declaration', async () => {
		const root = await createRoot()
		const stateDir = join(root, '.pikacss')
		const declaration = join(stateDir, 'pika.gen.ts')
		await write(declaration, '/* previous generation */')
		await write(join(root, 'pika.config.ts'), configSource(`
			export default defineConfig({
				engine: {
					plugins: [{
						name: 'test:prepare-failure',
						configureEngine() { throw new Error('prepare exploded') },
					}],
				},
			})
		`))

		await expect(preparePikaCSS({ cwd: root, host: { publicEntryModule: '@consumer/pikacss' } }))
			.rejects.toThrow('prepare exploded')
		expect(await readFile(declaration, 'utf8'))
			.toBe('/* previous generation */')
	})

	it('hard-fails main declaration publication while preserving the previous file', async () => {
		const root = await createRoot()
		const stateDir = join(root, '.pikacss')
		const declaration = join(stateDir, 'pika.gen.ts')
		await write(declaration, '/* previous generation */')
		// The atomic writer stages under <stateDir>/tmp. Making that path a file
		// forces a cross-platform staging failure without touching the canonical file.
		await writeFile(join(stateDir, 'tmp'), 'not-a-directory')

		await expect(preparePikaCSS({ cwd: root, host: { publicEntryModule: '@consumer/pikacss' } }))
			.rejects.toBeDefined()
		expect(await readFile(declaration, 'utf8'))
			.toBe('/* previous generation */')
	})
})

describe('initPikaCSS (#150)', () => {
	it.each([
		{ name: 'TypeScript ESM', ts: true, esm: true, expected: 'pika.config.mts' },
		{ name: 'TypeScript CommonJS', ts: true, esm: false, expected: 'pika.config.ts' },
		{ name: 'JavaScript ESM', ts: false, esm: true, expected: 'pika.config.mjs' },
		{ name: 'JavaScript CommonJS', ts: false, esm: false, expected: 'pika.config.js' },
	])('creates the canonical $name config only', async ({ ts, esm, expected }) => {
		const root = await createRoot()
		await write(join(root, 'package.json'), JSON.stringify({ ...(esm ? { type: 'module' } : {}) }))
		if (ts)
			await write(join(root, 'tsconfig.json'), '{}')

		const before = new Set(await readdir(root))
		const result = await initPikaCSS({ cwd: root, host: { publicEntryModule: '@consumer/pikacss' } })
		const after = new Set(await readdir(root))

		expect(result.created)
			.toBe(true)
		expect(result.configPath)
			.toBe(join(root, expected))
		expect(after.size - before.size)
			.toBe(1)
		expect(after.has(expected))
			.toBe(true)
		expect(await readFile(result.configPath, 'utf8'))
			.toContain('@consumer/pikacss')
		expect(result.typeProjectFile)
			.toBe(ts ? 'tsconfig.json' : 'jsconfig.json')
	})

	it('treats an installed TypeScript dependency as a TypeScript project without tsconfig', async () => {
		const root = await createRoot()
		await write(join(root, 'package.json'), JSON.stringify({ devDependencies: { typescript: '^6.0.0' } }))

		const result = await initPikaCSS({ cwd: root, host: { publicEntryModule: '@consumer/pikacss' } })
		expect(result.configPath)
			.toBe(join(root, 'pika.config.ts'))
	})

	it('creates a scaffold that the canonical host loader can immediately prepare when the host entry fulfills its contract', async () => {
		const root = await createRoot()
		await write(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
		await write(join(root, 'tsconfig.json'), '{}')

		const initialized = await initPikaCSS({
			cwd: root,
			host: { publicEntryModule: defineConfigPath },
		})
		expect(initialized.configPath)
			.toBe(join(root, 'pika.config.mts'))

		const prepared = await preparePikaCSS({
			cwd: root,
			host: { publicEntryModule: defineConfigPath },
		})
		expect(prepared.selectedConfigPath)
			.toBe(initialized.configPath)
		expect(await readFile(prepared.declarationPath, 'utf8'))
			.toContain(`import(${JSON.stringify(defineConfigPath)})`)
	})

	it('falls back conservatively on malformed package metadata and resolves host state defaults', async () => {
		const root = await createRoot()
		await write(join(root, 'package.json'), '{ malformed')

		let result = await initPikaCSS({
			cwd: root,
			host: { publicEntryModule: '@consumer/pikacss', defaultStateDir: '.host-state' },
		})
		expect(result.language)
			.toBe('javascript')
		expect(result.moduleMode)
			.toBe('commonjs')
		expect(result.stateDir)
			.toBe(join(root, '.host-state'))
		expect(result.generatedStatePath)
			.toBe('.host-state')

		result = await initPikaCSS({
			cwd: root,
			host: { publicEntryModule: '@consumer/pikacss', defaultStateDir: join(root, '.absolute-state') },
		})
		expect(result.stateDir)
			.toBe(join(root, '.absolute-state'))
	})

	it('does not overwrite an existing supported config or edit unrelated project files', async () => {
		const root = await createRoot()
		const packagePath = join(root, 'package.json')
		const ignorePath = join(root, '.gitignore')
		const configPath = join(root, 'pika.config.cjs')
		await write(packagePath, '{"scripts":{"postinstall":"keep-me"}}')
		await write(ignorePath, 'dist/\n')
		await write(configPath, 'module.exports = existingConfig')

		const result = await initPikaCSS({ cwd: root, host: { publicEntryModule: '@consumer/pikacss' } })

		expect(result.created)
			.toBe(false)
		expect(result.configPath)
			.toBe(configPath)
		expect(await readFile(configPath, 'utf8'))
			.toBe('module.exports = existingConfig')
		expect(await readFile(packagePath, 'utf8'))
			.toBe('{"scripts":{"postinstall":"keep-me"}}')
		expect(await readFile(ignorePath, 'utf8'))
			.toBe('dist/\n')
		expect(await fileNames(root))
			.toEqual(['.gitignore', 'package.json', 'pika.config.cjs'])
	})
})

async function fileNames(root: string): Promise<string[]> {
	return (await readdir(root)).sort()
}
