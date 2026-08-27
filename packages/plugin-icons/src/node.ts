import type { IconifyLoaderOptions } from '@iconify/utils'
import type { WatchableIconCollection } from './watchable'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, parse } from 'node:path'
import process from 'node:process'
import { quicklyValidateIconSet, searchForIcon } from '@iconify/utils'
import { loadNodeIcon } from '@iconify/utils/lib/loader/node-loader'
import { getPossibleIconNames } from '@iconify/utils/lib/loader/utils'
import { getPackageInfo } from 'local-pkg'
import { isAbsolute, join, resolve } from 'pathe'
import { createIconsPlugin } from './index'
import { getLocalIconLoaderScope } from './runtime-private'
import { attachFileSystemIconCatalog, defineWatchableIconCollection } from './watchable'

export * from './index'

/**
 * Creates a watchable icon collection backed by one directory of SVG files.
 *
 * @param options - The backing directory and optional file extension.
 * @param options.dir - Directory holding one file per icon; relative paths resolve from the engine host's project root (#118).
 * @param options.extension - File extension appended to the icon name.
 * @returns A watchable collection descriptor for `icons.collections`.
 *
 * @remarks
 * `i-app:home` resolves `<dir>/home.svg`. Contents are read fresh on every
 * resolution, so no SVG-content cache survives an engine re-derivation. Catalog
 * derivation registers direct-member directory membership separately from each
 * known icon file, so create/delete/rename and content/existence changes invalidate
 * the project generation with the correct dependency semantics.
 *
 * @example
 * ```ts
 * import { fileSystemIconCollection, icons } from '@pikacss/plugin-icons/node'
 * import { defineConfig } from '@pikacss/unplugin-pikacss'
 *
 * export default defineConfig({
 *   engine: {
 *     plugins: [icons()],
 *     icons: { collections: { app: fileSystemIconCollection({ dir: './icons' }) } },
 *   },
 * })
 * ```
 */
export function fileSystemIconCollection(options: { dir: string, extension?: string }): WatchableIconCollection {
	const { dir, extension = '.svg' } = options
	return attachFileSystemIconCatalog(defineWatchableIconCollection({
		dependencies: ({ name }) => join(dir, `${name}${extension}`),
		source: async (_name, context) => {
			const [filepath] = context.dependencies
			if (filepath == null)
				return undefined
			// Fresh read every time: stale SVG content must not survive an
			// engine re-derivation.
			return await readFile(filepath, 'utf-8')
				.catch(() => undefined)
		},
	}), { dir, extension })
}

async function enumerateFileSystemIconNames(directory: string, extension: string): Promise<string[]> {
	let entries
	try {
		entries = await readdir(directory, { withFileTypes: true })
	}
	catch (error: any) {
		if (error?.code === 'ENOENT')
			return []
		throw error
	}
	return entries
		.filter(entry => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(extension))
		.map(entry => entry.name.slice(0, -extension.length))
		.filter(Boolean)
		.sort()
}

async function findNearestPackageJson(start: string): Promise<string | null> {
	let current = resolve(start)
	while (true) {
		const candidate = join(current, 'package.json')
		try {
			await readFile(candidate, 'utf8')
			return candidate
		}
		catch (error: any) {
			if (error?.code !== 'ENOENT')
				throw error
		}
		const parent = dirname(current)
		if (parent === current || parse(current).root === current)
			return null
		current = parent
	}
}

async function discoverLocalIconCatalog(cwd: string | readonly string[]) {
	const roots = Array.isArray(cwd) ? cwd : [cwd]
	const identities = new Set<string>()
	const dependencies = new Set<string>()
	for (const root of roots) {
		const manifestPath = await findNearestPackageJson(root)
		if (manifestPath == null)
			continue
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
		dependencies.add(manifestPath)
		const direct = new Set<string>()
		for (const field of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
			const value = manifest[field]
			if (value == null || typeof value !== 'object' || Array.isArray(value))
				continue
			for (const name of Object.keys(value)) {
				if (name.startsWith('@iconify-json/'))
					direct.add(name)
			}
		}

		for (const packageName of [...direct].sort()) {
			const info = await getPackageInfo(packageName, { paths: [root] })
			if (info == null)
				continue
			dependencies.add(info.packageJsonPath)
			const catalogPath = join(info.rootPath, 'icons.json')
			const raw = JSON.parse(await readFile(catalogPath, 'utf8'))
			dependencies.add(catalogPath)
			const validated = quicklyValidateIconSet(raw)
			if (validated == null || typeof validated.prefix !== 'string' || validated.prefix.length === 0)
				throw new Error(`Invalid Iconify catalog: ${catalogPath}`)
			for (const name of [...Object.keys(validated.icons), ...Object.keys(validated.aliases ?? {})])
				identities.add(`${validated.prefix}:${name}`)
		}
	}
	return {
		identities: [...identities].sort(),
		dependencies: [...dependencies].map(path => isAbsolute(path) ? path : resolve(path))
			.sort(),
	}
}

interface FreshCollectionResult {
	readonly resolved: boolean
	readonly iconSet?: NonNullable<ReturnType<typeof quicklyValidateIconSet>>
}

const scopedCollectionCaches = new WeakMap<object, Map<string, Promise<FreshCollectionResult>>>()

async function loadFreshCollection(collection: string, root: string): Promise<FreshCollectionResult> {
	const info = await getPackageInfo(`@iconify-json/${collection}`, { paths: [root] })
	if (info == null)
		return { resolved: false }
	try {
		const raw = JSON.parse(await readFile(join(info.rootPath, 'icons.json'), 'utf8'))
		const validated = quicklyValidateIconSet(raw)
		return validated == null ? { resolved: true } : { resolved: true, iconSet: validated }
	}
	catch {
		return { resolved: true }
	}
}

async function loadFreshLocalIcon(collection: string, name: string, options: IconifyLoaderOptions) {
	const roots = Array.isArray(options.cwd) ? options.cwd : [options.cwd]
	const scope = getLocalIconLoaderScope(options)
	const cache = scope == null
		? undefined
		: (scopedCollectionCaches.get(scope) ?? (() => {
				const created = new Map<string, Promise<FreshCollectionResult>>()
				scopedCollectionCaches.set(scope, created)
				return created
			})())
	let resolvedScopedPackage = false
	for (const configuredRoot of roots) {
		const root = configuredRoot ?? process.cwd()
		const key = `${root}\0${collection}`
		let pending = cache?.get(key)
		if (pending == null) {
			pending = loadFreshCollection(collection, root)
			cache?.set(key, pending)
		}
		const loaded = await pending
		if (!loaded.resolved)
			continue
		resolvedScopedPackage = true
		if (loaded.iconSet == null)
			continue
		const svg = await searchForIcon(loaded.iconSet, collection, getPossibleIconNames(name), options)
		if (svg != null)
			return svg
	}
	if (resolvedScopedPackage)
		return undefined
	// Preserve legacy @iconify/json and autoInstall behavior only when no modern
	// scoped package resolves. A later Engine gets a fresh scope after install.
	return await loadNodeIcon(collection, name, options)
}

/**
 * Creates the Node.js icons plugin with locally installed Iconify collection loading.
 *
 * @returns An icons plugin configured with the Iconify Node.js loader.
 */
export function icons() {
	return createIconsPlugin({
		loadLocalIcon: loadFreshLocalIcon,
		shouldLoadLocalIcon: () => !process.env.ESLINT,
		enumerateFileSystemIconNames,
		discoverLocalIconCatalog,
	})
}
