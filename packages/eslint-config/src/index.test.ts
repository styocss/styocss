import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import * as publicApi from './index'
import pikacss, { pikacss as namedPikacss, recommended } from './index'

const defineConfigPath = new URL('../../config/src/index.ts', import.meta.url).pathname
const created: string[] = []
const originalCwd = process.cwd()

async function useProject(source?: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'pikacss-eslint-index-'))
	created.push(root)
	if (source != null) {
		await writeFile(join(root, 'pika.config.mts'), [
			`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
			source,
		].join('\n'))
	}
	process.chdir(root)
	return root
}

afterEach(async () => {
	process.chdir(originalCwd)
	await Promise.all(created.splice(0)
		.map(path => rm(path, { recursive: true, force: true })))
})

describe('public ESLint setup API', () => {
	it('exports one async setup factory and only the config option', async () => {
		await useProject()
		expect(pikacss())
			.toBeInstanceOf(Promise)
		expect(namedPikacss)
			.toBe(pikacss)
		expect(recommended)
			.toBe(pikacss)
		expect('plugin' in publicApi)
			.toBe(false)
		expect(await pikacss())
			.toMatchObject({
				languageOptions: {
					globals: { pika: 'readonly' },
				},
				rules: { 'pikacss/static-usage': 'error' },
			})
	})

	it('uses an explicit config selector and derives every single-entry root from it', async () => {
		const root = await useProject()
		const configPath = join(root, 'custom.config.mts')
		await writeFile(configPath, [
			`import { defineConfig } from ${JSON.stringify(defineConfigPath)}`,
			`export default defineConfig({ fnName: 'styled', scan: { include: 'src/**/*.ts' } })`,
		].join('\n'))

		const config = await pikacss({ config: 'custom.config.mts' })
		expect(config.languageOptions?.globals)
			.toEqual({ styled: 'readonly' })
		expect(config.rules)
			.toEqual({ 'pikacss/static-usage': 'error' })
	})

	it('derives all multi-entry roots as readonly globals from the same load', async () => {
		await useProject(`export default defineConfig([
			{ fnName: 'pika', cssModule: 'pika.css' },
			{ fnName: 'styled', cssModule: 'styled.css' },
		])`)
		const config = await pikacss()

		expect(config.languageOptions?.globals)
			.toEqual({ pika: 'readonly', styled: 'readonly' })
		const plugin = (config.plugins as any).pikacss
		expect(Object.keys(plugin.rules))
			.toEqual(['static-usage'])
	})
})
