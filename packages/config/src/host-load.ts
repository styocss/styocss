import type {
	ConfigHostDependencyTrace,
	ConfigHostFileDependency,
	LoadedPikaConfig,
	LoadPikaConfigOptions,
} from './host-types'
import type { DefinedPikaConfig } from './types'
import { stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize, resolve } from 'pathe'
import { dependenciesFromModulePaths, evaluateFreshConfigModule } from './host-evaluate'
import { assertStateDirSafe, normalizeAbsolutePath, resolveFrom } from './host-paths'
import { PikaConfigHostError } from './host-types'
import { normalizeDefinedConfig } from './normalize'
import { createSingleTransport } from './transport'

export const PIKA_CONFIG_AUTO_CANDIDATES = Object.freeze([
	'pika.config.ts',
	'pika.config.mts',
	'pika.config.js',
	'pika.config.mjs',
])

const EXPLICIT_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'])
const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i
const WINDOWS_DRIVE_ABSOLUTE_RE = /^[a-z]:[\\/]/i

interface Selection {
	readonly selectedConfigPath: string | null
	readonly selectionPaths: readonly string[]
}

function toDependencies(paths: Iterable<string>): readonly ConfigHostFileDependency[] {
	return Object.freeze([...paths].map(path => Object.freeze({ type: 'file' as const, path })))
}

function createDependencyTrace(
	selectionPaths: readonly string[],
	moduleDependencies: readonly ConfigHostFileDependency[],
): ConfigHostDependencyTrace {
	const selection = toDependencies(selectionPaths)
	const seen = new Set(selection.map(({ path }) => path))
	const all = [...selection]
	for (const dependency of moduleDependencies) {
		if (seen.has(dependency.path))
			continue
		seen.add(dependency.path)
		all.push(dependency)
	}
	return Object.freeze({ selection, modules: moduleDependencies, all: Object.freeze(all) })
}

function emptyTrace(selectionPaths: readonly string[]): ConfigHostDependencyTrace {
	return createDependencyTrace(selectionPaths, Object.freeze([]))
}

function invalidSelector(projectRoot: string, message: string, selectionPaths: readonly string[] = []): never {
	throw new PikaConfigHostError({
		message: `[pikacss/config] ${message}`,
		projectRoot,
		dependencies: emptyTrace(selectionPaths),
	})
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile()
	}
	catch (error: any) {
		if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR')
			return false
		throw error
	}
}

async function selectConfig(projectRoot: string, explicitConfig?: string): Promise<Selection> {
	if (explicitConfig !== undefined) {
		if (typeof explicitConfig !== 'string' || explicitConfig.trim().length === 0)
			invalidSelector(projectRoot, 'Explicit config selector must be a non-empty filesystem path')
		if (explicitConfig.includes('?') || explicitConfig.includes('#') || (URL_SCHEME_RE.test(explicitConfig) && !WINDOWS_DRIVE_ABSOLUTE_RE.test(explicitConfig)))
			invalidSelector(projectRoot, `Explicit config selector "${explicitConfig}" must be a filesystem path without URL/query/fragment syntax`)
		const selectedConfigPath = isAbsolute(explicitConfig)
			? normalize(explicitConfig)
			: resolve(projectRoot, explicitConfig)
		const selectionPaths = Object.freeze([selectedConfigPath])
		if (!EXPLICIT_EXTENSIONS.has(extname(selectedConfigPath)))
			invalidSelector(projectRoot, `Explicit config "${selectedConfigPath}" has an unsupported extension`, selectionPaths)
		if (!await isFile(selectedConfigPath))
			invalidSelector(projectRoot, `Explicit config "${selectedConfigPath}" does not exist or is not a file`, selectionPaths)
		return Object.freeze({ selectedConfigPath, selectionPaths })
	}

	const selectionPaths = Object.freeze(PIKA_CONFIG_AUTO_CANDIDATES.map(name => join(projectRoot, name)))
	const existing = (await Promise.all(selectionPaths.map(async path => ({ path, exists: await isFile(path) }))))
		.filter(({ exists }) => exists)
		.map(({ path }) => path)
	if (existing.length > 1) {
		throw new PikaConfigHostError({
			message: `[pikacss/config] Multiple PikaCSS config files found: ${existing.join(', ')}`,
			projectRoot,
			dependencies: emptyTrace(selectionPaths),
		})
	}
	return Object.freeze({ selectedConfigPath: existing[0] ?? null, selectionPaths })
}

function normalizeConfig(
	transport: DefinedPikaConfig | unknown,
	projectRoot: string,
	configDir: string,
	defaultStateDir?: string,
) {
	const config = normalizeDefinedConfig(transport, {
		resolvePath: value => resolveFrom(configDir, value),
		resolvePattern: value => resolveFrom(configDir, value),
		...(defaultStateDir === undefined ? {} : { defaultStateDir }),
	})
	assertStateDirSafe(projectRoot, config.stateDir)
	return config
}

/**
 * Selects, freshly evaluates, and canonically normalizes one PikaCSS project config.
 *
 * @remarks This is a low-level Node host API. It never creates Engines or owns
 * generation/watch lifecycle. Selection and actually evaluated project-local
 * module dependencies are returned for the caller to aggregate/watch.
 */
export async function loadPikaConfig(options: LoadPikaConfigOptions): Promise<LoadedPikaConfig> {
	if (options.defaultStateDir != null && !isAbsolute(options.defaultStateDir))
		throw new Error('defaultStateDir host default must be an absolute path')
	let projectRoot: string
	try {
		projectRoot = normalizeAbsolutePath(options.projectRoot, 'projectRoot')
	}
	catch (cause) {
		throw new PikaConfigHostError({
			message: `[pikacss/config] ${cause instanceof Error ? cause.message : String(cause)}`,
			projectRoot: String(options.projectRoot),
			dependencies: emptyTrace([]),
			cause,
		})
	}

	const selection = await selectConfig(projectRoot, options.config)
	const configDir = selection.selectedConfigPath == null ? projectRoot : dirname(selection.selectedConfigPath)
	if (selection.selectedConfigPath == null) {
		const config = normalizeConfig(createSingleTransport({}), projectRoot, configDir, options.defaultStateDir)
		return Object.freeze({
			projectRoot,
			selectedConfigPath: null,
			configDir,
			config,
			dependencies: emptyTrace(selection.selectionPaths),
		})
	}

	const loadedModules = new Set<string>()
	let transport: unknown
	try {
		transport = await evaluateFreshConfigModule(selection.selectedConfigPath, loadedModules)
	}
	catch (cause) {
		const modules = dependenciesFromModulePaths(loadedModules)
		throw new PikaConfigHostError({
			message: `[pikacss/config] Failed to evaluate config "${selection.selectedConfigPath}": ${cause instanceof Error ? cause.message : String(cause)}`,
			projectRoot,
			selectedConfigPath: selection.selectedConfigPath,
			dependencies: createDependencyTrace(selection.selectionPaths, modules),
			cause,
		})
	}

	const modules = dependenciesFromModulePaths(loadedModules)
	const dependencies = createDependencyTrace(selection.selectionPaths, modules)
	try {
		const config = normalizeConfig(transport, projectRoot, configDir, options.defaultStateDir)
		return Object.freeze({
			projectRoot,
			selectedConfigPath: selection.selectedConfigPath,
			configDir,
			config,
			dependencies,
		})
	}
	catch (cause) {
		throw new PikaConfigHostError({
			message: `[pikacss/config] Failed to normalize config "${selection.selectedConfigPath}": ${cause instanceof Error ? cause.message : String(cause)}`,
			projectRoot,
			selectedConfigPath: selection.selectedConfigPath,
			dependencies,
			cause,
		})
	}
}
