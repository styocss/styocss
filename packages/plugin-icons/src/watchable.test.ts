/**
 * #122 — watchable custom icon collections: branded descriptors declare the
 * filesystem dependencies behind their icons, registered with the engine
 * BEFORE each load (missing files stay watchable identities), resolved from
 * the engine host's project root (#118). Ordinary collections stay opaque
 * and untouched.
 */
import { readFile as fsReadFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createEngine } from '@pikacss/core'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createIconsPlugin, defineWatchableIconCollection, isWatchableIconCollection } from './index'
import { fileSystemIconCollection } from './node'

const createdDirs: string[] = []

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-watchable-icons-'))
	createdDirs.push(dir)
	return dir
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>'

async function engineWith(collections: Record<string, any>, projectRoot?: string) {
	return createEngine({
		plugins: [createIconsPlugin()],
		icons: { collections },
	}, projectRoot == null ? {} : { host: { projectRoot } })
}

describe('watchable icon collections (#122)', () => {
	it('brands descriptors so ordinary icon maps are never misidentified', () => {
		const watchable = defineWatchableIconCollection({
			source: async () => SVG,
			dependencies: './icons/app.json',
		})
		expect(isWatchableIconCollection(watchable))
			.toBe(true)
		// An inline map whose ICON NAMES collide with descriptor fields must
		// stay an ordinary opaque collection — no duck typing.
		expect(isWatchableIconCollection({ dependencies: SVG, source: SVG }))
			.toBe(false)
		expect(isWatchableIconCollection(() => SVG))
			.toBe(false)
	})

	it('leaves ordinary opaque collections unchanged and unwatched', async () => {
		const engine = await engineWith({
			plain: { home: SVG },
		})
		const ids = await engine.use('i-plain:home')

		expect(ids.length)
			.toBeGreaterThan(0)
		// The SVG data URL lives in the icon variable's preflight output.
		expect(await engine.renderPreflights(false))
			.toContain('data:image/svg+xml')
		expect(engine.configDependencies.size)
			.toBe(0)
	})

	it('registers collection-wide dependencies at engine configuration time', async () => {
		const projectRoot = await createTempDir()
		await engineWith({
			app: defineWatchableIconCollection({
				source: async () => SVG,
				dependencies: ['./icons/app-icons.json', '/shared/base-icons.json'],
			}),
		}, projectRoot)

		// Known before any icon resolves; relative from the host project
		// root, absolute kept as-is.
		const engine = await engineWith({
			app: defineWatchableIconCollection({
				source: async () => SVG,
				dependencies: ['./icons/app-icons.json', '/shared/base-icons.json'],
			}),
		}, projectRoot)
		expect(engine.configDependencies.has(join(projectRoot, 'icons/app-icons.json')))
			.toBe(true)
		expect(engine.configDependencies.has('/shared/base-icons.json'))
			.toBe(true)
	})

	it('registers per-icon dependencies resolved from the host project root before loading', async () => {
		const projectRoot = await createTempDir()
		const observedContexts: any[] = []
		const engine = await engineWith({
			app: defineWatchableIconCollection({
				source: async (_name, context) => {
					observedContexts.push(context)
					return SVG
				},
				dependencies: ({ name }) => `./icons/${name}.svg`,
			}),
		}, projectRoot)

		const ids = await engine.use('i-app:home')

		expect(ids.length)
			.toBeGreaterThan(0)
		expect(engine.configDependencies.has(join(projectRoot, 'icons/home.svg')))
			.toBe(true)
		expect(observedContexts[0])
			.toEqual({ projectRoot, dependencies: [join(projectRoot, 'icons/home.svg')] })
	})

	it('keeps a missing file registered as a dependency even when the load fails', async () => {
		const projectRoot = await createTempDir()
		const engine = await engineWith({
			app: defineWatchableIconCollection({
				// Simulates a loader that fails on the absent backing file.
				source: async () => undefined,
				dependencies: ({ name }) => `./icons/${name}.svg`,
			}),
		}, projectRoot)

		await engine.use('i-app:ghost')

		// Registration happened BEFORE the load attempt: recreating the file
		// later can recover through the normal dependency lifecycle.
		expect(engine.configDependencies.has(join(projectRoot, 'icons/ghost.svg')))
			.toBe(true)
	})

	it('supports inline maps as watchable sources', async () => {
		const projectRoot = await createTempDir()
		const engine = await engineWith({
			app: defineWatchableIconCollection({
				source: { home: SVG },
				dependencies: './icons/app.json',
			}),
		}, projectRoot)

		const ids = await engine.use('i-app:home')
		expect(ids.length)
			.toBeGreaterThan(0)
		expect(await engine.renderPreflights(false))
			.toContain('data:image/svg+xml')
	})

	it('two watchable collections keep independent dependency identities', async () => {
		const projectRoot = await createTempDir()
		const engine = await engineWith({
			a: defineWatchableIconCollection({
				source: async () => SVG,
				dependencies: ({ name }) => `./a/${name}.svg`,
			}),
			b: defineWatchableIconCollection({
				source: async () => SVG,
				dependencies: ({ name }) => `./b/${name}.svg`,
			}),
		}, projectRoot)

		await engine.use('i-a:one')
		await engine.use('i-b:two')

		expect(engine.configDependencies.has(join(projectRoot, 'a/one.svg')))
			.toBe(true)
		expect(engine.configDependencies.has(join(projectRoot, 'b/two.svg')))
			.toBe(true)
		expect(engine.configDependencies.has(join(projectRoot, 'a/two.svg')))
			.toBe(false)
	})

	it('fileSystemIconCollection reads fresh contents per engine and registers the file', async () => {
		const projectRoot = await createTempDir()
		await mkdir(join(projectRoot, 'icons'), { recursive: true })
		await writeFile(join(projectRoot, 'icons/logo.svg'), SVG)
		const collection = fileSystemIconCollection({ dir: './icons' })

		const a = await engineWith({ app: collection }, projectRoot)
		await a.use('i-app:logo')
		expect(a.configDependencies.has(join(projectRoot, 'icons/logo.svg')))
			.toBe(true)
		const cssA = await a.renderPreflights(false)
		expect(cssA)
			.toContain('data:image/svg+xml')

		// Fresh read across engine re-derivation: the same descriptor on a
		// new engine sees the edited bytes — no stale SVG-content cache.
		const edited = SVG.replace('M0 0h1v1H0z', 'M0 0h2v2H0z')
		await writeFile(join(projectRoot, 'icons/logo.svg'), edited)
		const b = await engineWith({ app: collection }, projectRoot)
		await b.use('i-app:logo')
		const cssB = await b.renderPreflights(false)
		expect(cssB)
			.toContain('M0 0h2v2H0z')
		expect(cssB)
			.not.toContain('M0 0h1v1H0z')
	})

	it('fileSystemIconCollection recovers when a deleted file is recreated (new engine)', async () => {
		const projectRoot = await createTempDir()
		await mkdir(join(projectRoot, 'icons'), { recursive: true })
		const file = join(projectRoot, 'icons/gone.svg')
		const collection = fileSystemIconCollection({ dir: './icons' })

		const a = await engineWith({ app: collection }, projectRoot)
		const missing = await a.use('i-app:gone')
		// Unresolved: echoes back the reference, but the identity is watched.
		expect(missing)
			.toEqual(['i-app:gone'])
		expect(a.configDependencies.has(file))
			.toBe(true)

		await writeFile(file, SVG)
		const b = await engineWith({ app: collection }, projectRoot)
		const recovered = await b.use('i-app:gone')
		expect(recovered.length)
			.toBeGreaterThan(1)
		expect(await b.renderPreflights(false))
			.toContain('data:image/svg+xml')
	})

	it('keeps the neutral entry free of Node imports', async () => {
		for (const file of ['./index.ts', './watchable.ts']) {
			const source = await fsReadFile(fileURLToPath(new URL(file, import.meta.url)), 'utf-8')
			expect(source.includes('node:'), `${file} must stay platform-neutral`)
				.toBe(false)
		}
	})
})

describe('descriptor identity hazards', () => {
	it('a spread copy of a descriptor degrades to an ordinary opaque collection', async () => {
		const projectRoot = await createTempDir()
		const original = defineWatchableIconCollection({
			source: async () => SVG,
			dependencies: ({ name }) => `./icons/${name}.svg`,
		})
		// Documented sharp edge: spreading drops the prototype the config
		// clone relies on, so the brand does not survive engine creation.
		const spread = { ...original }

		const engine = await engineWith({ app: spread }, projectRoot)
		await engine.use('i-app:home')

		expect(engine.configDependencies.size)
			.toBe(0)
	})
})
