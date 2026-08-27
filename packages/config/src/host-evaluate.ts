import type { ConfigHostFileDependency } from './host-types'
import { readFileSync } from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import { dirname, extname, isAbsolute, normalize } from 'pathe'
import { isNodeModulesPath, stripLoaderSuffix } from './host-paths'

interface CandidateModule {
	exports: any
}

function toFilesystemPath(value: string): string {
	if (value.startsWith('file://'))
		return normalize(fileURLToPath(value))
	return normalize(stripLoaderSuffix(value))
}

function toNativeImportId(value: string): string {
	if (/^(?:node|data|https?):/.test(value) || value.startsWith('file://'))
		return value
	return isAbsolute(value) ? pathToFileURL(value).href : value
}

function isProjectLocalFile(value: string): boolean {
	return isAbsolute(value) && !isNodeModulesPath(value)
}

function moduleTypeFlags(filename: string) {
	const ext = extname(filename)
	return {
		ts: /\.[cm]?tsx?$/.test(ext),
		json: ext === '.json',
	}
}

/** @internal */
export async function evaluateFreshConfigModule(
	selectedConfigPath: string,
	loadedProjectModules: Set<string>,
): Promise<unknown> {
	const AsyncFunction = Object.getPrototypeOf(evaluateFreshConfigModule)
		.constructor as new (...args: string[]) => (...args: any[]) => Promise<unknown>
	const modules = new Map<string, CandidateModule>()
	const jitiByParent = new Map<string, ReturnType<typeof createJiti>>()

	function getJiti(parent: string) {
		let jiti = jitiByParent.get(parent)
		if (jiti == null) {
			jiti = createJiti(parent, {
				interopDefault: true,
				moduleCache: false,
				// Transpile artifacts may be cached; evaluated module state may not.
				fsCache: true,
			})
			jitiByParent.set(parent, jiti)
		}
		return jiti
	}

	function resolveModule(parent: string, specifier: string, esm: boolean): string {
		if (isBuiltin(specifier) || (!isAbsolute(specifier) && /^[a-z][a-z\d+.-]*:/i.test(specifier)))
			return specifier
		const jiti = getJiti(parent)
		const resolved = esm
			? jiti.esmResolve(specifier)
			: jiti.resolve(specifier)
		return resolved.startsWith('file://') ? toFilesystemPath(resolved) : normalize(resolved)
	}

	function trace(filename: string) {
		loadedProjectModules.add(normalize(stripLoaderSuffix(filename)))
	}

	function createModuleRequire(parent: string) {
		const nativeRequire = createRequire(parent)
		const requireModule = ((specifier: string) => {
			const resolved = resolveModule(parent, specifier, false)
			if (isProjectLocalFile(resolved))
				return loadProjectModuleSync(resolved)
			return nativeRequire(resolved)
		}) as NodeRequire
		requireModule.resolve = Object.assign(
			(specifier: string) => resolveModule(parent, specifier, false),
			{ paths: nativeRequire.resolve.paths },
		)
		requireModule.cache = nativeRequire.cache
		requireModule.extensions = nativeRequire.extensions
		requireModule.main = nativeRequire.main
		return requireModule
	}

	async function importModule(parent: string, specifier: string): Promise<any> {
		const resolved = resolveModule(parent, specifier, true)
		if (isProjectLocalFile(resolved))
			return loadProjectModule(resolved)
		return import(toNativeImportId(resolved))
	}

	function esmResolve(parent: string, specifier: string): string {
		const resolved = getJiti(parent)
			.esmResolve(specifier)
		return isAbsolute(resolved) ? pathToFileURL(resolved).href : resolved
	}

	function transform(filename: string, source: string, async: boolean): string {
		const { ts } = moduleTypeFlags(filename)
		return getJiti(filename)
			.transform({
				filename,
				source,
				ts,
				async,
			})
	}

	function loadProjectModuleSync(filename: string): any {
		const normalized = normalize(filename)
		const existing = modules.get(normalized)
		if (existing != null)
			return existing.exports

		const record: CandidateModule = { exports: {} }
		modules.set(normalized, record)
		trace(normalized)
		try {
			const { json } = moduleTypeFlags(normalized)
			if (json) {
				record.exports = JSON.parse(readFileSync(normalized, 'utf8'))
				return record.exports
			}

			const source = readFileSync(normalized, 'utf8')
			const code = transform(normalized, source, false)
			const module = { exports: record.exports, filename: normalized, id: normalized, loaded: false }
			// eslint-disable-next-line no-new-func -- Execute Jiti-transpiled project config in the current process global without a VM sandbox.
			const fn = new Function(
				'exports',
				'require',
				'module',
				'__filename',
				'__dirname',
				'jitiImport',
				'jitiESMResolve',
				`${code}\n//# sourceURL=${normalized}`,
			)
			fn.call(
				module.exports,
				module.exports,
				createModuleRequire(normalized),
				module,
				normalized,
				dirname(normalized),
				(specifier: string) => importModule(normalized, specifier),
				(specifier: string) => esmResolve(normalized, specifier),
			)
			record.exports = module.exports
			return record.exports
		}
		catch (error) {
			modules.delete(normalized)
			throw error
		}
	}

	async function loadProjectModule(filename: string): Promise<any> {
		const normalized = normalize(filename)
		const existing = modules.get(normalized)
		if (existing != null)
			return existing.exports

		const record: CandidateModule = { exports: {} }
		modules.set(normalized, record)
		trace(normalized)
		try {
			const { json } = moduleTypeFlags(normalized)
			if (json) {
				record.exports = JSON.parse(readFileSync(normalized, 'utf8'))
				return record.exports
			}

			const source = readFileSync(normalized, 'utf8')
			const code = transform(normalized, source, true)
			const module = { exports: record.exports, filename: normalized, id: normalized, loaded: false }
			const fn = new AsyncFunction(
				'exports',
				'require',
				'module',
				'__filename',
				'__dirname',
				'jitiImport',
				'jitiESMResolve',
				`${code}\n//# sourceURL=${normalized}`,
			)
			await fn.call(
				module.exports,
				module.exports,
				createModuleRequire(normalized),
				module,
				normalized,
				dirname(normalized),
				(specifier: string) => importModule(normalized, specifier),
				(specifier: string) => esmResolve(normalized, specifier),
			)
			record.exports = module.exports
			return record.exports
		}
		catch (error) {
			modules.delete(normalized)
			throw error
		}
	}

	const namespace = await loadProjectModule(selectedConfigPath)
	if (namespace != null && typeof namespace === 'object' && 'default' in namespace)
		return namespace.default
	return namespace
}

/** @internal */
export function dependenciesFromModulePaths(paths: Iterable<string>): readonly ConfigHostFileDependency[] {
	return Object.freeze([...new Set(paths)]
		.sort()
		.map(path => Object.freeze({ type: 'file' as const, path })))
}
