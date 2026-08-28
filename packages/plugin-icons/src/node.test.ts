import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createEngine } from '@pikacss/core'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { icons } from './node'

const createdDirs: string[] = []

async function tempDir() {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-icons-catalog-')))
	createdDirs.push(dir)
	return dir
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

async function writeJson(path: string, value: unknown) {
	await mkdir(join(path, '..'), { recursive: true })
	await writeFile(path, JSON.stringify(value), 'utf8')
}

async function writeIconifyPackage(root: string, packageSuffix: string, options: {
	prefix?: string
	icons?: readonly string[]
	aliases?: Readonly<Record<string, string>>
	catalog?: unknown
}) {
	const packageRoot = join(root, 'node_modules', '@iconify-json', packageSuffix)
	await mkdir(packageRoot, { recursive: true })
	await writeJson(join(packageRoot, 'package.json'), {
		name: `@iconify-json/${packageSuffix}`,
		version: '1.0.0',
		exports: {
			'.': './index.js',
			'./icons.json': './icons.json',
			'./package.json': './package.json',
		},
	})
	await writeFile(join(packageRoot, 'index.js'), 'export default {}\n', 'utf8')
	if (options.catalog !== undefined) {
		await writeJson(join(packageRoot, 'icons.json'), options.catalog)
		return packageRoot
	}
	const prefix = options.prefix ?? packageSuffix
	await writeJson(join(packageRoot, 'icons.json'), {
		prefix,
		width: 24,
		height: 24,
		icons: Object.fromEntries((options.icons ?? ['home']).map(name => [name, { body: '<path d="M0 0h1v1H0z"/>' }])),
		aliases: Object.fromEntries(Object.entries(options.aliases ?? {})
			.map(([name, parent]) => [name, { parent }])),
	})
	return packageRoot
}

function shortcutDeclarations(engine: Awaited<ReturnType<typeof createEngine>>) {
	return engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')?.declarations ?? ''
}

function dependencyPaths(engine: Awaited<ReturnType<typeof createEngine>>) {
	return new Set(engine.configDependencies.map(({ path }) => path))
}

describe('node directly installed Iconify catalog discovery', () => {
	it('uses the nearest governing manifest, direct dependency fields, local-pkg resolution, and includes aliases', async () => {
		const root = await tempDir()
		const app = join(root, 'packages/app')
		await mkdir(app, { recursive: true })
		const foo = await writeIconifyPackage(root, 'foo', { icons: ['root-only'] })
		const bar = await writeIconifyPackage(root, 'bar', { icons: ['home'], aliases: { house: 'home' } })
		await writeJson(join(root, 'package.json'), { dependencies: { '@iconify-json/foo': '1.0.0' } })
		await writeJson(join(app, 'package.json'), {
			dependencies: { '@iconify-json/bar': '1.0.0' },
			peerDependencies: { '@iconify-json/foo': '1.0.0' },
		})

		const engine = await createEngine({ plugins: [icons()], icons: { cwd: app } }, { host: { projectRoot: app } })
		const declarations = shortcutDeclarations(engine)
		expect(declarations)
			.toContain('"i-bar:home": string')
		expect(declarations)
			.toContain('"i-bar:house": string')
		expect(declarations).not.toContain('root-only')
		const dependencies = dependencyPaths(engine)
		expect(dependencies)
			.toContain(join(app, 'package.json'))
		expect(dependencies)
			.toContain(join(bar, 'package.json'))
		expect(dependencies)
			.toContain(join(bar, 'icons.json'))
		expect(dependencies).not.toContain(join(root, 'package.json'))
		expect(dependencies).not.toContain(join(foo, 'icons.json'))
	})

	it('accepts dev/optional direct packages, treats unresolved declarations as normal absence, and dedupes logical identities', async () => {
		const root = await tempDir()
		await writeIconifyPackage(root, 'one', { prefix: 'same', icons: ['home'] })
		await writeIconifyPackage(root, 'two', { prefix: 'same', icons: ['home', 'other'] })
		await writeJson(join(root, 'package.json'), {
			devDependencies: { '@iconify-json/one': '1.0.0' },
			optionalDependencies: {
				'@iconify-json/two': '1.0.0',
				'@iconify-json/missing': '1.0.0',
			},
		})

		const engine = await createEngine({ plugins: [icons()], icons: { cwd: root } }, { host: { projectRoot: root } })
		const declarations = shortcutDeclarations(engine)
		expect(declarations.match(/"i-same:home": string/g))
			.toHaveLength(1)
		expect(declarations)
			.toContain('"i-same:other": string')
		expect(declarations).not.toContain('missing')
	})

	it('reads fresh direct-package icon bytes across Engine generations instead of reusing Iconify process-global cache state', async () => {
		const root = await tempDir()
		const packageRoot = await writeIconifyPackage(root, 'fresh', { icons: ['home'] })
		await writeJson(join(root, 'package.json'), { dependencies: { '@iconify-json/fresh': '1.0.0' } })

		const first = await createEngine({ plugins: [icons()], icons: { cwd: root } }, { host: { projectRoot: root } })
		const firstIds = await first.use('i-fresh:home')
		const firstCss = `${await first.renderPreflights(false, { usedAtomicStyleIds: new Set(firstIds) })}${await first.renderAtomicStyles(false, { atomicStyleIds: firstIds })}`
		expect(firstCss)
			.toContain('M0 0h1v1H0z')

		await writeJson(join(packageRoot, 'icons.json'), {
			prefix: 'fresh',
			width: 24,
			height: 24,
			icons: { home: { body: '<path d="M0 0h2v2H0z"/>' } },
		})
		const second = await createEngine({ plugins: [icons()], icons: { cwd: root } }, { host: { projectRoot: root } })
		const secondIds = await second.use('i-fresh:home')
		const secondCss = `${await second.renderPreflights(false, { usedAtomicStyleIds: new Set(secondIds) })}${await second.renderAtomicStyles(false, { atomicStyleIds: secondIds })}`
		expect(secondCss)
			.toContain('M0 0h2v2H0z')
		expect(secondCss).not.toContain('M0 0h1v1H0z')
	})

	it('hard-fails malformed or unreadable admitted exhaustive catalogs', async () => {
		const malformed = await tempDir()
		await writeIconifyPackage(malformed, 'bad', { catalog: { prefix: '', icons: {} } })
		await writeJson(join(malformed, 'package.json'), { dependencies: { '@iconify-json/bad': '1.0.0' } })
		await expect(createEngine({ plugins: [icons()], icons: { cwd: malformed } }, { host: { projectRoot: malformed } }))
			.rejects.toThrow(/Invalid Iconify catalog/)

		const unreadable = await tempDir()
		const packageRoot = join(unreadable, 'node_modules/@iconify-json/no-catalog')
		await mkdir(packageRoot, { recursive: true })
		await writeJson(join(packageRoot, 'package.json'), {
			name: '@iconify-json/no-catalog',
			version: '1.0.0',
			exports: { '.': './index.js', './package.json': './package.json' },
		})
		await writeFile(join(packageRoot, 'index.js'), 'export default {}\n')
		await writeJson(join(unreadable, 'package.json'), { dependencies: { '@iconify-json/no-catalog': '1.0.0' } })
		await expect(createEngine({ plugins: [icons()], icons: { cwd: unreadable } }, { host: { projectRoot: unreadable } }))
			.rejects.toThrow()
	})
})

describe('node filesystem/catalog edge semantics', () => {
	it('treats a missing filesystem directory as an empty recoverable catalog and records membership', async () => {
		const root = await tempDir()
		await writeJson(join(root, 'package.json'), {})
		const { fileSystemIconCollection } = await import('./node')
		const engine = await createEngine({
			plugins: [icons()],
			icons: { collections: { app: fileSystemIconCollection({ dir: './missing-icons' }) } },
		}, { host: { projectRoot: root } })
		expect(engine.configDependencies)
			.toContainEqual({ type: 'directory-membership', path: join(root, 'missing-icons') })
		expect(shortcutDeclarations(engine)).not.toContain('i-app:')
	})

	it('hard-fails filesystem enumeration errors other than missing directories', async () => {
		const root = await tempDir()
		await writeJson(join(root, 'package.json'), {})
		const notDirectory = join(root, 'icons-as-file')
		await writeFile(notDirectory, 'not a directory')
		const { fileSystemIconCollection } = await import('./node')
		await expect(createEngine({
			plugins: [icons()],
			icons: { collections: { app: fileSystemIconCollection({ dir: notDirectory }) } },
		}, { host: { projectRoot: root } }))
			.rejects.toThrow()
	})

	it('enumerates direct files and symlinks for a custom extension while ignoring other entries', async () => {
		const root = await tempDir()
		await writeJson(join(root, 'package.json'), {})
		const dir = join(root, 'icons')
		await mkdir(join(dir, 'nested'), { recursive: true })
		await writeFile(join(dir, 'home.icon'), '<svg/>')
		await writeFile(join(dir, 'ignore.svg'), '<svg/>')
		await symlink(join(dir, 'home.icon'), join(dir, 'alias.icon'))
		const { fileSystemIconCollection } = await import('./node')
		const engine = await createEngine({
			plugins: [icons()],
			icons: { collections: { app: fileSystemIconCollection({ dir, extension: '.icon' }) } },
		}, { host: { projectRoot: root } })
		const declarations = shortcutDeclarations(engine)
		expect(declarations)
			.toContain('"i-app:home": string')
		expect(declarations)
			.toContain('"i-app:alias": string')
		expect(declarations).not.toContain('ignore')
		expect(declarations).not.toContain('nested')
	})

	it('supports cwd arrays across independent governing manifests', async () => {
		const root = await tempDir()
		const a = join(root, 'a')
		const b = join(root, 'b')
		await mkdir(a, { recursive: true })
		await mkdir(b, { recursive: true })
		await writeIconifyPackage(a, 'one', { prefix: 'one', icons: ['a'] })
		await writeIconifyPackage(b, 'two', { prefix: 'two', icons: ['b'] })
		await writeJson(join(a, 'package.json'), { dependencies: { '@iconify-json/one': '1.0.0' } })
		await writeJson(join(b, 'package.json'), { dependencies: { '@iconify-json/two': '1.0.0' } })
		const engine = await createEngine({ plugins: [icons()], icons: { cwd: [a, b] } }, { host: { projectRoot: root } })
		const declarations = shortcutDeclarations(engine)
		expect(declarations)
			.toContain('"i-one:a": string')
		expect(declarations)
			.toContain('"i-two:b": string')
	})

	it('returns undefined when the filesystem loader is invoked without a resolved dependency path', async () => {
		const { fileSystemIconCollection } = await import('./node')
		const collection = fileSystemIconCollection({ dir: './icons' })
		const source = collection.source
		expect(typeof source)
			.toBe('function')
		if (typeof source === 'function') {
			expect(await source('home', { projectRoot: '/project', dependencies: [] }))
				.toBeUndefined()
		}
	})
})
