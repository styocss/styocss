/**
 * #115 — module attribution is established by the integration itself around
 * per-module work, so engine/plugin code deep inside a transform (or the
 * production full scan) always observes the correct module scope, even under
 * concurrent interleaved transforms. Interleaving is forced with explicit
 * deferreds — never timing luck.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createDeferred } from '../../_shared/vitest'
import { createCtx } from './ctx'
import { getDiagnosticScope } from './diagnosticScope'

const createdDirs: string[] = []

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-attribution-'))
	createdDirs.push(dir)
	return dir
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

/** Records the module scope observed inside engine plugin work, per color. */
function createRecordingPlugin(observed: Map<string, string | undefined>, gates?: Map<string, Promise<void>>) {
	return {
		name: 'test:scope-recorder',
		transformStyleItems: async (styleItems: any[]) => {
			for (const item of styleItems) {
				const color = typeof item === 'object' && item != null ? (item as any).color : undefined
				if (typeof color !== 'string')
					continue
				const gate = gates?.get(color)
				if (gate != null)
					await gate
				observed.set(color, getDiagnosticScope().moduleId)
			}
			return styleItems
		},
	}
}

describe('module attribution (#115)', () => {
	it('attributes interleaved concurrent transforms to their own modules', async () => {
		const cwd = await createTempDir()
		const observed = new Map<string, string | undefined>()
		const gateRed = createDeferred()
		const gateBlue = createDeferred()
		const gates = new Map<string, Promise<void>>([
			['red', gateRed.promise],
			['blue', gateBlue.promise],
		])
		const ctx = createCtx({
			cwd,
			currentPackageName: '@pikacss/core',
			scan: { include: ['src/**/*.ts'], exclude: [] },
			configOrPath: { plugins: [createRecordingPlugin(observed, gates)] },
			fnName: 'pika',
			transformedFormat: 'string',
			tsCodegen: false,
			autoCreateConfig: false,
		})
		await ctx.setup()

		// A suspends inside engine/plugin work; B starts and its prepare resumes
		// first. B may not complete its transform before A because #149 now
		// commits semantic slots in host encounter order. Attribution is observed
		// inside concurrent prepare work, independently of that commit barrier.
		const transformA = ctx.transform('export const a = pika({ color: \'red\' })', 'src/a.ts')
		const transformB = ctx.transform('export const b = pika({ color: \'blue\' })', 'src/b.ts')

		gateBlue.resolve()
		while (!observed.has('blue'))
			await Promise.resolve()
		gateRed.resolve()
		await Promise.all([transformA, transformB])

		expect(observed.get('red'))
			.toBe(join(cwd, 'src/a.ts'))
		expect(observed.get('blue'))
			.toBe(join(cwd, 'src/b.ts'))
	})

	it('attributes integration-owned full-scan work per scanned module', async () => {
		const cwd = await createTempDir()
		await mkdir(join(cwd, 'src'), { recursive: true })
		await writeFile(join(cwd, 'src/a.ts'), 'export const a = pika({ color: \'red\' })\n')
		await writeFile(join(cwd, 'src/b.ts'), 'export const b = pika({ color: \'blue\' })\n')

		const observed = new Map<string, string | undefined>()
		const ctx = createCtx({
			cwd,
			currentPackageName: '@pikacss/core',
			scan: { include: ['src/**/*.ts'], exclude: [] },
			configOrPath: { plugins: [createRecordingPlugin(observed)] },
			fnName: 'pika',
			transformedFormat: 'string',
			tsCodegen: false,
			autoCreateConfig: false,
		})
		await ctx.setup()
		await ctx.fullyCssCodegen()

		expect(observed.get('red'))
			.toBe(join(cwd, 'src/a.ts'))
		expect(observed.get('blue'))
			.toBe(join(cwd, 'src/b.ts'))
	})

	it('keeps project-level setup work outside any module scope', async () => {
		const cwd = await createTempDir()
		let setupScopeModuleId: string | undefined = 'unset'
		const ctx = createCtx({
			cwd,
			currentPackageName: '@pikacss/core',
			scan: { include: ['src/**/*.ts'], exclude: [] },
			configOrPath: {
				plugins: [{
					name: 'test:setup-scope',
					configureEngine: async () => {
						setupScopeModuleId = getDiagnosticScope().moduleId
					},
				}],
			},
			fnName: 'pika',
			transformedFormat: 'string',
			tsCodegen: false,
			autoCreateConfig: false,
		})
		await ctx.setup()

		expect(setupScopeModuleId)
			.toBeUndefined()
	})
})
