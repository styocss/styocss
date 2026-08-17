/**
 * #118 — project-relative token sources resolve against the engine host's
 * effective project root (Vite root, Nuxt rootDir, monorepo app dir), never
 * against the shell cwd once a host supplied one. The Node adapter's
 * process.cwd() remains a standalone fallback only.
 */
import { readFile as fsReadFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createEngine } from '@pikacss/core'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createDeferred } from '../../_shared/vitest'
import { designTokens as designTokensNeutral } from './index'
import { designTokens as designTokensNode } from './node'

const createdDirs: string[] = []

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-host-root-'))
	createdDirs.push(dir)
	return dir
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

async function writeTokens(dir: string, relpath: string, tokens: object) {
	const filepath = join(dir, relpath)
	await mkdir(join(filepath, '..'), { recursive: true })
	await writeFile(filepath, JSON.stringify(tokens))
	return filepath
}

const TOKENS = { color: { primary: { $value: '#h05' } } }

describe('host project root (#118)', () => {
	it('resolves relative sources against host.projectRoot when the shell cwd differs', async () => {
		// Mirrors Vite custom root / Nuxt rootDir / monorepo app dir: the host
		// root is a temp dir that is definitely NOT process.cwd().
		const projectRoot = await createTempDir()
		await writeTokens(projectRoot, 'tokens.json', TOKENS)
		expect(projectRoot)
			.not.toBe(process.cwd())

		const engine = await createEngine({
			plugins: [designTokensNode()],
			designTokens: { pruneUnused: false, sources: ['./tokens.json'] },
		}, { host: { projectRoot } })

		expect(await engine.renderPreflights(false))
			.toContain('--color-primary:#h05')
		// Config dependencies are the absolute files actually consumed.
		expect(engine.configDependencies.has(join(projectRoot, 'tokens.json')))
			.toBe(true)
	})

	it('keeps an absolute designTokens.root authoritative over the host root', async () => {
		const projectRoot = await createTempDir()
		const sharedRoot = await createTempDir()
		await writeTokens(sharedRoot, 'tokens.json', TOKENS)

		const engine = await createEngine({
			plugins: [designTokensNode()],
			designTokens: { pruneUnused: false, root: sharedRoot, sources: ['./tokens.json'] },
		}, { host: { projectRoot } })

		expect(await engine.renderPreflights(false))
			.toContain('--color-primary:#h05')
		expect(engine.configDependencies.has(join(sharedRoot, 'tokens.json')))
			.toBe(true)
	})

	it('resolves a relative designTokens.root from the host project root, not the shell cwd', async () => {
		const projectRoot = await createTempDir()
		await writeTokens(projectRoot, 'design/tokens.json', TOKENS)

		const engine = await createEngine({
			plugins: [designTokensNode()],
			designTokens: { pruneUnused: false, root: './design', sources: ['./tokens.json'] },
		}, { host: { projectRoot } })

		expect(await engine.renderPreflights(false))
			.toContain('--color-primary:#h05')
		expect(engine.configDependencies.has(join(projectRoot, 'design/tokens.json')))
			.toBe(true)
	})

	it('falls back to the runtime cwd for standalone use without a host context', async () => {
		const dir = await createTempDir()
		await writeTokens(dir, 'tokens.json', TOKENS)
		// The /node adapter injects `cwd: () => process.cwd()`; injecting the
		// same capability keeps the fallback branch under test without a
		// process-wide chdir (unsafe if the pool ever becomes threads).
		const engine = await createEngine({
			plugins: [designTokensNeutral({
				readFile: filepath => fsReadFile(filepath, 'utf-8'),
				cwd: () => dir,
			})],
			designTokens: { pruneUnused: false, sources: ['./tokens.json'] },
		})
		expect(await engine.renderPreflights(false))
			.toContain('--color-primary:#h05')
	})

	it('lets concurrent engines share one definition while resolving different project roots', async () => {
		const rootA = await createTempDir()
		const rootB = await createTempDir()
		await writeTokens(rootA, 'tokens.json', { color: { alpha: { $value: '#aaa' } } })
		await writeTokens(rootB, 'tokens.json', { color: { beta: { $value: '#bbb' } } })

		const plugin = designTokensNode()
		const holdA = createDeferred()
		const releaseB = createDeferred()
		const gate = {
			name: 'test:gate',
			configureRawConfig: async (config: any) => {
				if (config.__gate === 'a') {
					releaseB.resolve()
					await holdA.promise
				}
			},
		}

		const creatingA = createEngine({
			plugins: [plugin, gate],
			designTokens: { pruneUnused: false, sources: ['./tokens.json'] },
			__gate: 'a',
		} as any, { host: { projectRoot: rootA } })
		await releaseB.promise
		const b = await createEngine({
			plugins: [plugin, gate],
			designTokens: { pruneUnused: false, sources: ['./tokens.json'] },
		} as any, { host: { projectRoot: rootB } })
		holdA.resolve()
		const a = await creatingA

		expect(await a.renderPreflights(false))
			.toContain('--color-alpha:#aaa')
		expect(await a.renderPreflights(false))
			.not.toContain('--color-beta')
		expect(await b.renderPreflights(false))
			.toContain('--color-beta:#bbb')
	})

	it('exposes projectRoot and the effective root to custom loaders', async () => {
		const projectRoot = await createTempDir()
		await writeTokens(projectRoot, 'design/tokens.custom', TOKENS)
		const observed: Record<string, string> = {}

		const engine = await createEngine({
			plugins: [designTokensNode()],
			designTokens: {
				pruneUnused: false,
				root: './design',
				sources: ['./tokens.custom'],
				loaders: [{
					name: 'custom',
					match: id => id.endsWith('.custom'),
					load: async (id, ctx) => {
						observed.projectRoot = ctx.projectRoot
						observed.root = ctx.root
						ctx.addDependency(id)
						return JSON.parse(await ctx.readFile(id))
					},
				}],
			},
		}, { host: { projectRoot } })

		expect(await engine.renderPreflights(false))
			.toContain('--color-primary:#h05')
		expect(observed.projectRoot)
			.toBe(projectRoot)
		expect(observed.root)
			.toBe(join(projectRoot, 'design'))
	})

	it('keeps the neutral entry free of Node imports', async () => {
		// Covers the entry and its direct loader module — the two files a
		// non-Node host actually executes.
		for (const file of ['./index.ts', './load.ts']) {
			const source = await fsReadFile(fileURLToPath(new URL(file, import.meta.url)), 'utf-8')
			expect(source.includes('node:'), `${file} must stay platform-neutral`)
				.toBe(false)
		}
	})
})

describe('defensive context handling', () => {
	it('degrades to the standalone fallback when a hand-built context lacks host', async () => {
		const dir = await createTempDir()
		await writeTokens(dir, 'tokens.json', TOKENS)
		const plugin = designTokensNeutral({
			readFile: filepath => fsReadFile(filepath, 'utf-8'),
			cwd: () => dir,
		})

		const config: any = { designTokens: { pruneUnused: false, sources: ['./tokens.json'] } }
		// Mirrors the onDiagnostic fallback contract: no crash, runtime cwd wins.
		await plugin.configureRawConfig?.(config, { state: (plugin as any).createState() } as any)

		expect(JSON.stringify(config.variables?.definitions ?? []))
			.toContain('--color-primary')
	})
})
