/**
 * #122 — watchable custom icon collections: branded descriptors declare the
 * filesystem dependencies behind their icons, registered with the engine
 * BEFORE each load (missing files stay watchable identities), resolved from
 * the engine host's project root (#118). Ordinary collections stay opaque
 * and untouched.
 */
import { readFile as fsReadFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createEngine } from '@pikacss/core'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createIconsPlugin, defineWatchableIconCollection, isWatchableIconCollection } from './index'
import { fileSystemIconCollection, icons as nodeIcons } from './node'
import { getFileSystemIconCatalogMetadata } from './watchable'

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

function fileDependencyPaths(engine: { configDependencies: readonly { type: string, path: string }[] }) {
	return new Set(engine.configDependencies
		.filter(({ type }) => type === 'file')
		.map(({ path }) => path))
}

async function engineWith(collections: Record<string, any>, projectRoot?: string) {
	return createEngine({
		plugins: [createIconsPlugin()],
		icons: { collections },
	}, projectRoot == null ? {} : { host: { projectRoot } })
}

async function renderedIconCss(engine: Awaited<ReturnType<typeof createEngine>>, ids: string[]) {
	return `${await engine.renderPreflights(false, { usedAtomicStyleIds: ids })}${await engine.renderAtomicStyles(false, { atomicStyleIds: ids })}`
}

async function nodeEngineWith(collections: Record<string, any>, projectRoot: string) {
	return createEngine({
		plugins: [nodeIcons()],
		icons: { collections },
	}, { host: { projectRoot } })
}

describe('watchable icon collections (#122)', () => {
	it('brands descriptors so ordinary icon maps are never misidentified', () => {
		expect(getFileSystemIconCatalogMetadata({ home: SVG }))
			.toBeUndefined()
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
		// Runtime atomics reference the Icons-owned private variable; its payload is emitted by the preflight projection.
		expect(await renderedIconCss(engine, ids))
			.toContain('data:image/svg+xml')
		expect(fileDependencyPaths(engine).size)
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
		expect(fileDependencyPaths(engine)
			.has(join(projectRoot, 'icons/app-icons.json')))
			.toBe(true)
		expect(fileDependencyPaths(engine)
			.has('/shared/base-icons.json'))
			.toBe(true)
	})

	it('passes per-icon dependency paths to request-oriented loaders without mutating finalized Engine dependencies', async () => {
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
		expect(fileDependencyPaths(engine)
			.has(join(projectRoot, 'icons/home.svg')))
			.toBe(false)
		expect(observedContexts[0])
			.toEqual({ projectRoot, dependencies: [join(projectRoot, 'icons/home.svg')] })
	})

	it('does not late-register a missing request-specific file after Engine finalization', async () => {
		const projectRoot = await createTempDir()
		const engine = await engineWith({
			app: defineWatchableIconCollection({
				// Simulates a loader that fails on the absent backing file.
				source: async () => undefined,
				dependencies: ({ name }) => `./icons/${name}.svg`,
			}),
		}, projectRoot)

		await engine.use('i-app:ghost')

		// Opaque request-specific identities are not derivation-time catalog members,
		// so resolving them later must not reopen finalized Engine dependencies.
		expect(fileDependencyPaths(engine)
			.has(join(projectRoot, 'icons/ghost.svg')))
			.toBe(false)
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
		expect(await renderedIconCss(engine, ids))
			.toContain('data:image/svg+xml')
	})

	it('keeps request-specific dependency identities out of finalized Engine dependencies', async () => {
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

		expect(fileDependencyPaths(engine)
			.has(join(projectRoot, 'a/one.svg')))
			.toBe(false)
		expect(fileDependencyPaths(engine)
			.has(join(projectRoot, 'b/two.svg')))
			.toBe(false)
		expect(fileDependencyPaths(engine)
			.has(join(projectRoot, 'a/two.svg')))
			.toBe(false)
	})

	it('fileSystemIconCollection reads fresh contents per engine without late dependency mutation', async () => {
		const projectRoot = await createTempDir()
		await mkdir(join(projectRoot, 'icons'), { recursive: true })
		await writeFile(join(projectRoot, 'icons/logo.svg'), SVG)
		const collection = fileSystemIconCollection({ dir: './icons' })

		const a = await nodeEngineWith({ app: collection }, projectRoot)
		await a.use('i-app:logo')
		expect(fileDependencyPaths(a)
			.has(join(projectRoot, 'icons/logo.svg')))
			.toBe(true)
		const cssA = `${await a.renderPreflights(false)}${await a.renderAtomicStyles(false)}`
		expect(cssA)
			.toContain('data:image/svg+xml')

		// Fresh read across engine re-derivation: the same descriptor on a
		// new engine sees the edited bytes — no stale SVG-content cache.
		const edited = SVG.replace('M0 0h1v1H0z', 'M0 0h2v2H0z')
		await writeFile(join(projectRoot, 'icons/logo.svg'), edited)
		const b = await nodeEngineWith({ app: collection }, projectRoot)
		await b.use('i-app:logo')
		const cssB = `${await b.renderPreflights(false)}${await b.renderAtomicStyles(false)}`
		expect(cssB)
			.toContain('M0 0h2v2H0z')
		expect(cssB)
			.not.toContain('M0 0h1v1H0z')
	})

	it('fileSystemIconCollection re-derives the concrete corpus after a direct-member rename', async () => {
		const projectRoot = await createTempDir()
		await mkdir(join(projectRoot, 'icons'), { recursive: true })
		const oldFile = join(projectRoot, 'icons/old.svg')
		const newFile = join(projectRoot, 'icons/new.svg')
		await writeFile(oldFile, SVG)
		const collection = fileSystemIconCollection({ dir: './icons' })

		const before = await nodeEngineWith({ app: collection }, projectRoot)
		const beforeDeclarations = before.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')?.declarations ?? ''
		expect(beforeDeclarations)
			.toContain('"i-app:old": string')
		expect(beforeDeclarations).not.toContain('"i-app:new": string')

		await rename(oldFile, newFile)
		const after = await nodeEngineWith({ app: collection }, projectRoot)
		const afterDeclarations = after.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')?.declarations ?? ''
		expect(afterDeclarations)
			.toContain('"i-app:new": string')
		expect(afterDeclarations).not.toContain('"i-app:old": string')
		expect(after.configDependencies)
			.toContainEqual({
				type: 'directory-membership',
				path: join(projectRoot, 'icons'),
			})
	})

	it('fileSystemIconCollection recovers when a deleted file is recreated (new engine)', async () => {
		const projectRoot = await createTempDir()
		await mkdir(join(projectRoot, 'icons'), { recursive: true })
		const file = join(projectRoot, 'icons/gone.svg')
		const collection = fileSystemIconCollection({ dir: './icons' })

		const a = await nodeEngineWith({ app: collection }, projectRoot)
		const missing = await a.use('i-app:gone')
		// Unresolved: echoes back the reference; the directory-membership dependency owns later discovery.
		expect(missing)
			.toEqual(['i-app:gone'])
		expect(fileDependencyPaths(a)
			.has(file))
			.toBe(false)

		await writeFile(file, SVG)
		const b = await nodeEngineWith({ app: collection }, projectRoot)
		const recovered = await b.use('i-app:gone')
		expect(recovered.length)
			.toBeGreaterThan(1)
		expect(await renderedIconCss(b, recovered))
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
	it('a spread copy keeps the symbol initially but loses the capability through the plain-object config clone', async () => {
		const original = defineWatchableIconCollection({
			source: async () => SVG,
			dependencies: SVG,
		})
		const spread = { ...original }
		expect(isWatchableIconCollection(spread))
			.toBe(true)

		const engine = await engineWith({ app: spread })
		// If the watchable brand survived Core's plain-object config clone, the
		// descriptor-wide dependency would have been registered. Instead the
		// string/function fields are interpreted as ordinary inline icon members.
		expect(fileDependencyPaths(engine).size)
			.toBe(0)
		const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')?.declarations ?? ''
		expect(declarations)
			.toContain('"i-app:source": string')
		expect(declarations)
			.toContain('"i-app:dependencies": string')
	})
})
