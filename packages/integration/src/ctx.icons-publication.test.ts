import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createCtx } from './ctx'

const createdDirs: string[] = []
const defineConfigPath = new URL('../../config/src/index.ts', import.meta.url).pathname
const iconsPath = new URL('../../plugin-icons/src/index.ts', import.meta.url).pathname

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-icons-publication-'))
	createdDirs.push(dir)
	return dir
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

describe('icons committed-liveness runtime CSS publication (#151)', () => {
	it('removes private SVG publication when the last committed icon usage disappears without requiring asset GC', async () => {
		const cwd = await createTempDir()
		await writeFile(join(cwd, 'pika.config.ts'), [
			`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
			`import { icons } from ${JSON.stringify(iconsPath)}`,
			`export default defineConfig({`,
			`  scan: { include: ['src/**/*.ts'], exclude: [] },`,
			`  engine: {`,
			`    plugins: [icons()],`,
			`    icons: { collections: { app: { home: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>' } } },`,
			`  },`,
			`})`,
			'',
		].join('\n'))
		const ctx = createCtx({
			cwd,
			currentPackageName: '@pikacss/core',
			scan: { include: ['**/*'], exclude: [] },
			configOrPath: null,
			fnName: 'pika',
			transformedFormat: 'string',
			tsCodegen: false,
			autoCreateConfig: false,
		})
		await ctx.setup()

		await ctx.transform(`export const cls = pika('i-app:home')`, 'src/icon.ts')
		await ctx.waitForIdle()
		const withIcon = await readFile(ctx.cssCodegenFilepath, 'utf8')
		expect(withIcon)
			.toContain('--pk-svg-icon-app--home')
		expect(withIcon)
			.toContain('data:image/svg+xml')

		await ctx.transform(`export const cls = 'no-icon'`, 'src/icon.ts')
		await ctx.waitForIdle()
		const withoutIcon = await readFile(ctx.cssCodegenFilepath, 'utf8')
		expect(withoutIcon).not.toContain('--pk-svg-icon-app--home')
		expect(withoutIcon).not.toContain('data:image/svg+xml')

		// Storage remains monotonic inside this generation: unscoped Core rendering
		// still observes the asset through old stored atomics. Integration's actual
		// publication is narrower because P2 supplies the committed live-id snapshot.
		expect(await ctx.engine.renderPreflights(false))
			.toContain('--pk-svg-icon-app--home')
	})
})
