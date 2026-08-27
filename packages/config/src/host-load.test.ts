import type { PikaConfigHostError } from './host'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { loadPikaConfig, PIKA_CONFIG_AUTO_CANDIDATES } from './host'

const created: string[] = []
const defineConfigPath = new URL('./index.ts', import.meta.url).pathname
const originalBranch = process.env.PIKA_CONFIG_TEST_BRANCH

function configSource(body: string): string {
	return [
		`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
		body,
	].join('\n')
}

async function createRoot(prefix = 'pikacss-config-host-'): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix))
	created.push(root)
	return root
}

async function write(path: string, source: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, source)
}

function tempModulePaths(errorOrLoaded: { dependencies: { modules: readonly { path: string }[] } }, root: string): string[] {
	return errorOrLoaded.dependencies.modules
		.map(({ path }) => path)
		.filter(path => path.startsWith(root))
}

async function expectHostError(run: Promise<unknown>): Promise<PikaConfigHostError> {
	try {
		await run
		expect.unreachable('expected Config host failure')
	}
	catch (error) {
		expect(error)
			.toMatchObject({ name: 'PikaConfigHostError' })
		return error as PikaConfigHostError
	}
}

afterEach(async () => {
	if (originalBranch === undefined)
		delete process.env.PIKA_CONFIG_TEST_BRANCH
	else
		process.env.PIKA_CONFIG_TEST_BRANCH = originalBranch
	for (const key of Object.keys(globalThis)
		.filter(key => key.startsWith('__pikacssConfigHostTest')))
		delete (globalThis as Record<string, unknown>)[key]
	await Promise.all(created.splice(0)
		.map(path => rm(path, { recursive: true, force: true })))
})

describe('loadPikaConfig selection and normalization', () => {
	it('returns the synthetic default and all auto-discovery watch inputs when no config exists', async () => {
		const root = await createRoot()
		const loaded = await loadPikaConfig({ projectRoot: root })

		expect(loaded.selectedConfigPath)
			.toBeNull()
		expect(loaded.configDir)
			.toBe(root)
		expect(loaded.config.authoringForm)
			.toBe('single')
		expect(loaded.config.stateDir)
			.toBe(join(root, '.pikacss'))
		expect(loaded.config.entries[0])
			.toMatchObject({
				fnName: 'pika',
				cssModule: 'pika.css',
				transformedFormat: 'string',
				report: false,
			})
		expect(loaded.dependencies.selection.map(({ path }) => path))
			.toEqual(
				PIKA_CONFIG_AUTO_CANDIDATES.map(name => join(root, name)),
			)
		expect(loaded.dependencies.modules)
			.toEqual([])
	})

	it('does not search upward when projectRoot has no direct config candidate', async () => {
		const parent = await createRoot()
		const root = join(parent, 'child-project')
		await mkdir(root)
		await write(join(parent, 'pika.config.ts'), configSource(`export default defineConfig({ fnName: 'parent' })`))

		const loaded = await loadPikaConfig({ projectRoot: root })
		expect(loaded.selectedConfigPath)
			.toBeNull()
		expect(loaded.config.entries[0]!.fnName)
			.toBe('pika')
		expect(loaded.dependencies.selection.map(({ path }) => path))
			.toEqual(PIKA_CONFIG_AUTO_CANDIDATES.map(name => join(root, name)))
	})

	it('auto-discovers exactly one canonical candidate and ignores cts/cjs in auto mode', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.cts'), configSource(`export default defineConfig({ fnName: 'ignored' })`))
		let loaded = await loadPikaConfig({ projectRoot: root })
		expect(loaded.selectedConfigPath)
			.toBeNull()

		await write(join(root, 'pika.config.mts'), configSource(`export default defineConfig({ fnName: 'chosen' })`))
		loaded = await loadPikaConfig({ projectRoot: root })
		expect(loaded.selectedConfigPath)
			.toBe(join(root, 'pika.config.mts'))
		expect(loaded.config.entries[0]!.fnName)
			.toBe('chosen')

		const modulePaths = loaded.dependencies.modules.map(({ path }) => path)
		expect(modulePaths)
			.toEqual([...modulePaths].sort())
		const allPaths = loaded.dependencies.all.map(({ path }) => path)
		expect(allPaths.slice(0, PIKA_CONFIG_AUTO_CANDIDATES.length))
			.toEqual(PIKA_CONFIG_AUTO_CANDIDATES.map(name => join(root, name)))
		expect(allPaths.filter(path => path === loaded.selectedConfigPath))
			.toHaveLength(1)
	})

	it('hard-errors on multiple auto candidates while preserving all selection dependencies', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`export default defineConfig({})`))
		await write(join(root, 'pika.config.js'), configSource(`export default defineConfig({})`))
		const error = await expectHostError(loadPikaConfig({ projectRoot: root }))

		expect(error.message)
			.toContain('Multiple PikaCSS config files found')
		expect(error.dependencies.selection.map(({ path }) => path))
			.toEqual(
				PIKA_CONFIG_AUTO_CANDIDATES.map(name => join(root, name)),
			)
	})

	it('treats explicit selection as closed and supports cts/cjs', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`export default defineConfig({ fnName: 'auto' })`))
		await write(join(root, 'nested/custom.cts'), configSource(`export default defineConfig({ fnName: 'explicitCts' })`))
		await write(join(root, 'nested/custom.cjs'), [
			`const { defineConfig } = require(${JSON.stringify(defineConfigPath)})`,
			`module.exports = defineConfig({ fnName: 'explicitCjs' })`,
		].join('\n'))

		const cts = await loadPikaConfig({ projectRoot: root, config: 'nested/custom.cts' })
		expect(cts.config.entries[0]!.fnName)
			.toBe('explicitCts')
		expect(cts.dependencies.selection)
			.toEqual([{ type: 'file', path: join(root, 'nested/custom.cts') }])

		const cjs = await loadPikaConfig({ projectRoot: root, config: join(root, 'nested/custom.cjs') })
		expect(cjs.config.entries[0]!.fnName)
			.toBe('explicitCjs')
	})

	it('never falls back from invalid or missing explicit selection to discovery', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), configSource(`export default defineConfig({ fnName: 'auto' })`))
		await mkdir(join(root, 'directory.config.ts'))

		for (const config of ['missing.ts', 'config.json', 'https://example.test/pika.config.ts', 'pika.config.ts?raw', 'pika.config.ts#x', 'directory.config.ts']) {
			const error = await expectHostError(loadPikaConfig({ projectRoot: root, config }))
			expect(error.message).not.toContain('Multiple PikaCSS')
		}
	})

	it('rejects a relative projectRoot but accepts normalized absolute spelling', async () => {
		const error = await expectHostError(loadPikaConfig({ projectRoot: 'relative/root' }))
		expect(error.message)
			.toContain('projectRoot must be an absolute filesystem path')
	})

	it('rejects plain object and array exports instead of bypassing defineConfig transport', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), `export default { fnName: 'oops' }`)
		let error = await expectHostError(loadPikaConfig({ projectRoot: root }))
		expect(error.message)
			.toContain('expected the opaque value returned by defineConfig()')

		await write(join(root, 'pika.config.ts'), `export default [{ fnName: 'oops', cssModule: 'oops.css' }]`)
		error = await expectHostError(loadPikaConfig({ projectRoot: root }))
		expect(error.message)
			.toContain('expected the opaque value returned by defineConfig()')
	})

	it('uses the selected symlink spelling as configDir rather than target realpath', async () => {
		const root = await createRoot()
		const targetRoot = await createRoot('pikacss-config-target-')
		const selectedDir = join(root, 'selected')
		await mkdir(selectedDir)
		const target = join(targetRoot, 'real-config.ts')
		const selected = join(selectedDir, 'linked.config.ts')
		await write(target, configSource(`export default defineConfig({
			stateDir: '.state',
			scan: { include: 'src/**/*.ts' },
			report: { output: 'reports/final.json' },
		})`))
		await symlink(target, selected)

		const loaded = await loadPikaConfig({ projectRoot: root, config: 'selected/linked.config.ts' })
		expect(loaded.selectedConfigPath)
			.toBe(selected)
		expect(loaded.configDir)
			.toBe(selectedDir)
		expect(loaded.config.stateDir)
			.toBe(join(selectedDir, '.state'))
		expect(loaded.config.entries[0]!.scan.include)
			.toEqual([join(selectedDir, 'src/**/*.ts')])
		expect(loaded.config.entries[0]!.report)
			.toEqual({ output: join(selectedDir, 'reports/final.json') })
	})

	it('rejects stateDir that equals or contains projectRoot while allowing descendants and siblings', async () => {
		const root = await createRoot()
		const configPath = join(root, 'pika.config.ts')
		for (const stateDir of ['.', '..']) {
			await write(configPath, configSource(`export default defineConfig({ stateDir: ${JSON.stringify(stateDir)} })`))
			const error = await expectHostError(loadPikaConfig({ projectRoot: root }))
			expect(error.message)
				.toContain('must not equal or contain projectRoot')
		}

		await write(configPath, configSource(`export default defineConfig({ stateDir: '.state' })`))
		expect((await loadPikaConfig({ projectRoot: root })).config.stateDir)
			.toBe(join(root, '.state'))
		await write(configPath, configSource(`export default defineConfig({ stateDir: '../sibling-state' })`))
		expect((await loadPikaConfig({ projectRoot: root })).config.stateDir)
			.toBe(join(dirname(root), 'sibling-state'))
	})
})

describe('loadPikaConfig fresh candidate graph and dependency trace', () => {
	it('freshly re-evaluates static TS and executed dynamic MJS modules on every load', async () => {
		const root = await createRoot()
		await write(join(root, 'static.ts'), `
			globalThis.__pikacssConfigHostTestStatic = (globalThis.__pikacssConfigHostTestStatic ?? 0) + 1
			export const value = globalThis.__pikacssConfigHostTestStatic
		`)
		await write(join(root, 'dynamic.mjs'), `
			globalThis.__pikacssConfigHostTestDynamic = (globalThis.__pikacssConfigHostTestDynamic ?? 0) + 1
			export const value = globalThis.__pikacssConfigHostTestDynamic
		`)
		await write(join(root, 'unused.ts'), `throw new Error('unexecuted branch must stay unloaded')`)
		await write(join(root, 'pika.config.ts'), configSource(`
			import { value as s } from './static.ts'
			const d = (await import('./dynamic.mjs')).value
			if (false) await import('./unused.ts')
			export default defineConfig({ fnName: \`pika\${s}\${d}\` })
		`))

		const first = await loadPikaConfig({ projectRoot: root })
		const second = await loadPikaConfig({ projectRoot: root })
		expect(first.config.entries[0]!.fnName)
			.toBe('pika11')
		expect(second.config.entries[0]!.fnName)
			.toBe('pika22')
		for (const loaded of [first, second]) {
			expect(tempModulePaths(loaded, root))
				.toEqual([
					join(root, 'dynamic.mjs'),
					join(root, 'pika.config.ts'),
					join(root, 'static.ts'),
				])
		}
	})

	it('preserves singleton identity within one candidate but not across candidates', async () => {
		const root = await createRoot()
		await write(join(root, 'shared.ts'), `
			globalThis.__pikacssConfigHostTestShared = (globalThis.__pikacssConfigHostTestShared ?? 0) + 1
			export const value = globalThis.__pikacssConfigHostTestShared
		`)
		await write(join(root, 'a.ts'), `import { value } from './shared.ts'; export const a = value`)
		await write(join(root, 'b.ts'), `import { value } from './shared.ts'; export const b = value`)
		await write(join(root, 'pika.config.ts'), configSource(`
			import { a } from './a.ts'
			import { b } from './b.ts'
			export default defineConfig({ fnName: \`pika\${a}\${b}\` })
		`))

		expect((await loadPikaConfig({ projectRoot: root })).config.entries[0]!.fnName)
			.toBe('pika11')
		const second = await loadPikaConfig({ projectRoot: root })
		expect(second.config.entries[0]!.fnName)
			.toBe('pika22')
		expect(tempModulePaths(second, root)
			.filter(path => path.endsWith('/shared.ts')))
			.toHaveLength(1)
	})

	it('changes actual dynamic dependency trace with executed branches only', async () => {
		const root = await createRoot()
		await write(join(root, 'a.ts'), `export const value = 'a'`)
		await write(join(root, 'b.ts'), `export const value = 'b'`)
		await write(join(root, 'pika.config.ts'), configSource(`
			const branch = process.env.PIKA_CONFIG_TEST_BRANCH === 'b' ? 'b' : 'a'
			const value = branch === 'a' ? (await import('./a.ts')).value : (await import('./b.ts')).value
			export default defineConfig({ cssModule: \`pika.\${value}.css\` })
		`))

		process.env.PIKA_CONFIG_TEST_BRANCH = 'a'
		const a = await loadPikaConfig({ projectRoot: root })
		process.env.PIKA_CONFIG_TEST_BRANCH = 'b'
		const b = await loadPikaConfig({ projectRoot: root })
		expect(tempModulePaths(a, root))
			.toContain(join(root, 'a.ts'))
		expect(tempModulePaths(a, root)).not.toContain(join(root, 'b.ts'))
		expect(tempModulePaths(b, root))
			.toContain(join(root, 'b.ts'))
		expect(tempModulePaths(b, root)).not.toContain(join(root, 'a.ts'))
	})

	it('returns dependencies discovered by a failed candidate and re-evaluates them after recovery', async () => {
		const root = await createRoot()
		await write(join(root, 'helper.ts'), `
			globalThis.__pikacssConfigHostTestRecovery = (globalThis.__pikacssConfigHostTestRecovery ?? 0) + 1
			export const value = globalThis.__pikacssConfigHostTestRecovery
		`)
		await write(join(root, 'pika.config.ts'), configSource(`
			import { value } from './helper.ts'
			throw new Error('candidate boom ' + value)
		`))

		const error = await expectHostError(loadPikaConfig({ projectRoot: root }))
		expect(error.message)
			.toContain('candidate boom 1')
		expect(tempModulePaths(error, root))
			.toEqual([join(root, 'helper.ts'), join(root, 'pika.config.ts')])

		await write(join(root, 'pika.config.ts'), configSource(`
			import { value } from './helper.ts'
			export default defineConfig({ fnName: \`pika\${value}\` })
		`))
		expect((await loadPikaConfig({ projectRoot: root })).config.entries[0]!.fnName)
			.toBe('pika2')
	})

	it('fresh-loads bare workspace/source modules resolved outside node_modules', async () => {
		const root = await createRoot()
		const workspace = await createRoot('pikacss-workspace-package-')
		await write(join(workspace, 'package.json'), JSON.stringify({ name: 'workspace-pkg', type: 'module', exports: './index.ts' }))
		await write(join(workspace, 'index.ts'), `
			globalThis.__pikacssConfigHostTestWorkspace = (globalThis.__pikacssConfigHostTestWorkspace ?? 0) + 1
			export const value = globalThis.__pikacssConfigHostTestWorkspace
		`)
		await mkdir(join(root, 'node_modules'), { recursive: true })
		await symlink(workspace, join(root, 'node_modules/workspace-pkg'), 'dir')
		await write(join(root, 'pika.config.ts'), configSource(`
			import { value } from 'workspace-pkg'
			export default defineConfig({ fnName: \`pika\${value}\` })
		`))

		const first = await loadPikaConfig({ projectRoot: root })
		const second = await loadPikaConfig({ projectRoot: root })
		expect(first.config.entries[0]!.fnName)
			.toBe('pika1')
		expect(second.config.entries[0]!.fnName)
			.toBe('pika2')
		expect(second.dependencies.modules.map(({ path }) => path))
			.toContain(join(workspace, 'index.ts'))
	})

	it('supports candidate-local CJS require, JSON, require.resolve, and self-cycle semantics', async () => {
		const root = await createRoot()
		const externalDir = join(root, 'node_modules/external-cjs')
		await write(join(externalDir, 'package.json'), JSON.stringify({ name: 'external-cjs', main: './index.cjs' }))
		await write(join(externalDir, 'index.cjs'), `
			globalThis.__pikacssConfigHostTestExternalCjs = (globalThis.__pikacssConfigHostTestExternalCjs ?? 0) + 1
			module.exports = { value: globalThis.__pikacssConfigHostTestExternalCjs }
		`)
		await write(join(root, 'data.json'), JSON.stringify({ value: 7 }))
		await write(join(root, 'local.cjs'), `
			globalThis.__pikacssConfigHostTestLocalCjs = (globalThis.__pikacssConfigHostTestLocalCjs ?? 0) + 1
			exports.value = globalThis.__pikacssConfigHostTestLocalCjs
			exports.self = require('./local.cjs') === exports
		`)
		await write(join(root, 'pika.config.cjs'), [
			`const { defineConfig } = require(${JSON.stringify(defineConfigPath)})`,
			`const data = require('./data.json')`,
			`const local = require('./local.cjs')`,
			`const external = require('external-cjs')`,
			`if (!local.self || !require.resolve('./local.cjs').endsWith('/local.cjs')) throw new Error('cjs contract failed')`,
			`module.exports = defineConfig({ fnName: \`pika\${data.value}\${local.value}\${external.value}\` })`,
		].join('\n'))

		const first = await loadPikaConfig({ projectRoot: root, config: 'pika.config.cjs' })
		const second = await loadPikaConfig({ projectRoot: root, config: 'pika.config.cjs' })
		expect(first.config.entries[0]!.fnName)
			.toBe('pika711')
		expect(second.config.entries[0]!.fnName)
			.toBe('pika721')
		expect(tempModulePaths(second, root))
			.toEqual([
				join(root, 'data.json'),
				join(root, 'local.cjs'),
				join(root, 'pika.config.cjs'),
			])
		expect(second.dependencies.modules.some(({ path }) => path.includes('/node_modules/external-cjs/')))
			.toBe(false)
	})

	it('supports Node builtins, project-local JSON dynamic imports, and import.meta.resolve', async () => {
		const root = await createRoot()
		await write(join(root, 'data.json'), JSON.stringify({ value: 3 }))
		await write(join(root, 'helper.ts'), `export const ok = true`)
		await write(join(root, 'pika.config.ts'), configSource(`
			import path from 'node:path'
			const data = await import('./data.json')
			const resolved = import.meta.resolve('./helper.ts')
			if (!path.isAbsolute(${JSON.stringify(root)}) || !resolved.includes('helper.ts')) throw new Error('host intrinsic failure')
			export default defineConfig({ fnName: \`pika\${data.default?.value ?? data.value}\` })
		`))

		const loaded = await loadPikaConfig({ projectRoot: root })
		expect(loaded.config.entries[0]!.fnName)
			.toBe('pika3')
		expect(tempModulePaths(loaded, root))
			.toContain(join(root, 'data.json'))
		expect(tempModulePaths(loaded, root)).not.toContain(join(root, 'helper.ts'))
	})

	it('preserves non-Error evaluation causes and traces the failing root', async () => {
		const root = await createRoot()
		await write(join(root, 'pika.config.ts'), `throw 'string-boom'`)
		const error = await expectHostError(loadPikaConfig({ projectRoot: root }))
		expect(error.message)
			.toContain('string-boom')
		expect(tempModulePaths(error, root))
			.toEqual([join(root, 'pika.config.ts')])
	})

	it('leaves installed node_modules dependencies process-cached and out of the project-local trace', async () => {
		const root = await createRoot()
		const externalDir = join(root, 'node_modules/external-pkg')
		await write(join(externalDir, 'package.json'), JSON.stringify({ name: 'external-pkg', type: 'module', exports: './index.mjs' }))
		await write(join(externalDir, 'index.mjs'), `
			globalThis.__pikacssConfigHostTestExternal = (globalThis.__pikacssConfigHostTestExternal ?? 0) + 1
			export const value = globalThis.__pikacssConfigHostTestExternal
		`)
		await write(join(root, 'pika.config.ts'), configSource(`
			import { value } from 'external-pkg'
			export default defineConfig({ fnName: \`pika\${value}\` })
		`))

		const first = await loadPikaConfig({ projectRoot: root })
		const second = await loadPikaConfig({ projectRoot: root })
		expect(first.config.entries[0]!.fnName)
			.toBe('pika1')
		expect(second.config.entries[0]!.fnName)
			.toBe('pika1')
		expect(second.dependencies.modules.some(({ path }) => path.includes('/node_modules/external-pkg/')))
			.toBe(false)
	})
})
