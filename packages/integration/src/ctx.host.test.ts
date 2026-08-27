import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPikaCSSContext } from './ctx'

const configIndexSpecifier = new URL('../../config/src/index.ts', import.meta.url).pathname
const createdDirs: string[] = []

async function createTempProject() {
	const root = await mkdtemp(join(tmpdir(), 'pikacss-integration-host-'))
	createdDirs.push(root)
	await mkdir(join(root, 'src'), { recursive: true })
	return root
}

function configSource(body: string) {
	return [
		`import { defineConfig } from ${JSON.stringify(configIndexSpecifier)}`,
		`export default defineConfig(${body})`,
	].join('\n')
}

function reportPluginSource(label: string, options: { throw?: boolean, onCall?: string } = {}) {
	return `{
		name: 'test:report-${label}',
		configureEngine(configurator) {
			configurator.runtime.designTokens = {
				report() {
					${options.onCall ?? ''}
					${options.throw
						? `throw new Error('report ${label} failed')`
						: `return {
						totalTokens: ${label.length + 1},
						used: ['--${label}-used'],
						unused: ['--${label}-unused'],
						deprecatedInUse: [],
						strictViolations: { warning: 0, error: 0 },
					}`}
				},
			}
		},
	}`
}

afterEach(async () => {
	await Promise.all(createdDirs.splice(0)
		.map(root => rm(root, { recursive: true, force: true })))
})

describe('canonical host Integration seam', () => {
	it('exposes a host-safe context without Engine internals', () => {
		const context = createPikaCSSContext({
			projectRoot: '/tmp/pikacss-host-safe',
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})

		expect(context)
			.not.toHaveProperty('engine')
		expect(context)
			.not.toHaveProperty('resolvedConfig')
		const initialBehavior = context.configErrorBehavior
		context.configErrorBehavior = 'throw'
		expect(initialBehavior)
			.toBe('retain-last-good')
		expect(context.configErrorBehavior)
			.toBe('throw')
	})

	it('keeps dependency relevance and host forwarding inside Integration', async () => {
		const root = await createTempProject()
		const dependencyFile = join(root, 'tokens.json')
		const iconDir = join(root, 'icons')
		await writeFile(dependencyFile, '{}\n', 'utf8')
		await mkdir(join(iconDir, 'nested'), { recursive: true })
		await writeFile(join(root, 'src/entry.ts'), 'export const cls = pika({ color: \'red\' })\n', 'utf8')
		await writeFile(join(root, 'pika.config.ts'), configSource(`{
			engine: {
				plugins: [{
					name: 'test:host-dependencies',
					configureEngine(configurator) {
						configurator.runtime.addConfigDependency(${JSON.stringify(dependencyFile)})
						configurator.runtime.addConfigDirectoryMembershipDependency(${JSON.stringify(iconDir)})
					},
				}],
			},
			scan: { include: ['src/**/*.ts'], exclude: [] },
		}`), 'utf8')

		const armDependencies = vi.fn()
		const activations: unknown[] = []
		const context = createPikaCSSContext({
			projectRoot: root,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'live',
			armDependencies,
			onActivated: (activation) => {
				activations.push(activation)
			},
		})

		await context.setup()
		await context.prepareBuild()
		expect(armDependencies)
			.toHaveBeenCalled()
		expect(activations)
			.toHaveLength(1)
		await context.handleHostChange(join(root, 'src/entry.ts'), { event: 'delete' })
		expect(activations)
			.toHaveLength(1)

		await context.handleHostChange(join(iconDir, 'new.svg'), { event: 'update' })
		expect(activations)
			.toHaveLength(2)

		await context.handleHostChange(join(iconDir, 'nested', 'new.svg'), { event: 'update' })
		expect(activations)
			.toHaveLength(2)

		await context.handleHostChange(dependencyFile, { event: 'update' })
		expect(activations)
			.toHaveLength(3)

		const withoutActivation = createPikaCSSContext({
			projectRoot: root,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies,
		})
		await withoutActivation.setup()
	})

	it('finalizes enabled production reports in config order and writes configured output', async () => {
		const root = await createTempProject()
		const output = join(root, 'reports', 'admin.json')
		await writeFile(join(root, 'pika.config.ts'), configSource(`[
			{
				fnName: 'app',
				cssModule: 'app.css',
				report: true,
				engine: { plugins: [${reportPluginSource('app')}] },
			},
			{
				fnName: 'skip',
				cssModule: 'skip.css',
				report: false,
				engine: { plugins: [${reportPluginSource('skip', { throw: true })}] },
			},
			{
				fnName: 'admin',
				cssModule: 'admin.css',
				report: { output: 'reports/admin.json' },
				engine: { plugins: [${reportPluginSource('admin')}] },
			},
		]`), 'utf8')

		const context = createPikaCSSContext({
			projectRoot: root,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})
		await context.setup()

		const summaries = await context.finalizeProductionReports()
		expect(summaries.map(summary => [summary.entryIndex, summary.fnName, summary.cssModule, summary.domain]))
			.toEqual([
				[0, 'app', 'app.css', 'design-tokens'],
				[2, 'admin', 'admin.css', 'design-tokens'],
			])
		expect(Object.isFrozen(summaries))
			.toBe(true)
		expect(Object.isFrozen(summaries[0]))
			.toBe(true)
		expect(Object.isFrozen(summaries[0]!.report.used))
			.toBe(true)
		expect(Object.isFrozen(summaries[0]!.report.strictViolations))
			.toBe(true)
		expect(summaries[1]!.outputPath)
			.toBe(output)
		expect(JSON.parse(await readFile(output, 'utf8')))
			.toEqual(summaries[1]!.report)
		expect(await readFile(output, 'utf8'))
			.toMatch(/\n$/u)
	})

	it('captures a generation when finalizing from a cold context', async () => {
		const root = await createTempProject()
		await writeFile(join(root, 'pika.config.ts'), configSource(`{ report: true }`), 'utf8')
		const context = createPikaCSSContext({
			projectRoot: root,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})

		await expect(context.finalizeProductionReports()).resolves.toEqual([])
	})

	it('propagates production report producer and output publication failures', async () => {
		const producerRoot = await createTempProject()
		await writeFile(join(producerRoot, 'pika.config.ts'), configSource(`{
			report: true,
			engine: { plugins: [${reportPluginSource('boom', { throw: true })}] },
		}`), 'utf8')
		const producerContext = createPikaCSSContext({
			projectRoot: producerRoot,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})
		await producerContext.setup()
		await expect(producerContext.finalizeProductionReports()).rejects.toThrow('report boom failed')

		const outputRoot = await createTempProject()
		await writeFile(join(outputRoot, 'blocked'), 'not a directory', 'utf8')
		await writeFile(join(outputRoot, 'pika.config.ts'), configSource(`{
			report: { output: 'blocked/report.json' },
			engine: { plugins: [${reportPluginSource('output')}] },
		}`), 'utf8')
		const outputContext = createPikaCSSContext({
			projectRoot: outputRoot,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})
		await outputContext.setup()
		await expect(outputContext.finalizeProductionReports()).rejects.toThrow()

		const renameRoot = await createTempProject()
		await mkdir(join(renameRoot, 'reports', 'target.json'), { recursive: true })
		await writeFile(join(renameRoot, 'pika.config.ts'), configSource(`{
			report: { output: 'reports/target.json' },
			engine: { plugins: [${reportPluginSource('rename')}] },
		}`), 'utf8')
		const renameContext = createPikaCSSContext({
			projectRoot: renameRoot,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})
		await renameContext.setup()
		await expect(renameContext.finalizeProductionReports()).rejects.toBeDefined()
	})

	it('does not run production reports during build preparation', async () => {
		const root = await createTempProject()
		await writeFile(join(root, 'pika.config.ts'), configSource(`{
			report: true,
			engine: { plugins: [${reportPluginSource('prepare', { throw: true })}] },
		}`), 'utf8')
		const context = createPikaCSSContext({
			projectRoot: root,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})

		await context.setup()
		await expect(context.prepareBuild()).resolves.toBeUndefined()
		await expect(context.finalizeProductionReports()).rejects.toThrow('report prepare failed')
	})

	it('keeps a report operation on its captured generation across a reload', async () => {
		const root = await createTempProject()
		const configPath = join(root, 'pika.config.ts')
		const oldOutput = join(root, 'reports', 'old.json')
		const newOutput = join(root, 'reports', 'new.json')
		const reportStarted = '__pikaReportStartedForTest'
		await writeFile(configPath, configSource(`{
			report: { output: 'reports/old.json' },
			engine: { plugins: [${reportPluginSource('old', { onCall: `globalThis.${reportStarted}?.()` })}] },
		}`), 'utf8')

		const context = createPikaCSSContext({
			projectRoot: root,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})
		await context.setup()

		const testGlobal = globalThis as typeof globalThis & { __pikaReportStartedForTest?: () => void }
		let reload: Promise<void> | undefined
		testGlobal.__pikaReportStartedForTest = () => {
			if (reload != null)
				return
			reload = (async () => {
				await writeFile(configPath, configSource(`{
					report: { output: 'reports/new.json' },
					engine: { plugins: [${reportPluginSource('new')}] },
				}`), 'utf8')
				await context.handleHostChange(configPath, { event: 'update' })
			})()
		}

		try {
			const first = await context.finalizeProductionReports()
			expect(first[0]?.report.used)
				.toEqual(['--old-used'])
			await reload

			const second = await context.finalizeProductionReports()
			expect(second[0]?.report.used)
				.toEqual(['--new-used'])
			expect(await readFile(oldOutput, 'utf8'))
				.toContain('--old-used')
			expect(await readFile(newOutput, 'utf8'))
				.toContain('--new-used')
		}
		finally {
			delete testGlobal.__pikaReportStartedForTest
		}
	})

	it('skips enabled entries without a report producer and rejects non-serializable producer output', async () => {
		const noProducerRoot = await createTempProject()
		await writeFile(join(noProducerRoot, 'pika.config.ts'), configSource(`{ report: true }`), 'utf8')
		const noProducerContext = createPikaCSSContext({
			projectRoot: noProducerRoot,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})
		await noProducerContext.setup()
		expect(await noProducerContext.finalizeProductionReports())
			.toEqual([])

		const invalidRoot = await createTempProject()
		await writeFile(join(invalidRoot, 'pika.config.ts'), configSource(`{
			report: true,
			engine: { plugins: [{
				name: 'test:undefined-report',
				configureEngine(configurator) {
					configurator.runtime.designTokens = { report: () => undefined }
				},
			}] },
		}`), 'utf8')
		const invalidContext = createPikaCSSContext({
			projectRoot: invalidRoot,
			publicEntryModule: '@pikacss/test-host',
			mode: () => 'oneshot',
			armDependencies: () => {},
		})
		await invalidContext.setup()
		await expect(invalidContext.finalizeProductionReports()).rejects.toThrow('not JSON serializable')
	})
})
