import type { ResolvedProjectConfig, ResolvedProjectEntry } from '@pikacss/config'
import type { PikaScanMatcher } from '@pikacss/config/host'
import type {
	DiagnosticHandler,
	Engine,
	EngineConfigDependency,
	EnginePlugin,
	TypegenSnapshot,
} from '@pikacss/core'
import type { ModuleState } from './ctx.pipeline'
import type { UsageRecord } from './types'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createPikaScanMatcher, loadPikaConfig, PikaConfigHostError } from '@pikacss/config/host'
import { createEngine } from '@pikacss/core'
import { isAbsolute, join, normalize } from 'pathe'
import { hashSource } from './ctx.pipeline'
import { parseModuleId } from './moduleId'
import { createDefaultProcessorRegistry } from './processors/registry'

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function numberToChars(num: number): string {
	if (num < ID_CHARS.length)
		return ID_CHARS[num]!
	let result = ''
	let n = num
	while (n >= 0) {
		result += ID_CHARS[n % ID_CHARS.length]
		n = Math.floor(n / ID_CHARS.length) - 1
	}
	return result
}

export type ProjectDependency = EngineConfigDependency

export interface ProjectRoutingTable<T> extends Iterable<readonly [string, T]> {
	readonly size: number
	get: (key: string) => T | undefined
	has: (key: string) => boolean
}

export interface KnownModule {
	readonly id: string
	readonly code: string
	readonly sourceHash: string
}

export interface ProjectGenerationEntry {
	readonly index: number
	readonly config: ResolvedProjectEntry
	readonly engine: Engine
	readonly typegenSnapshot: TypegenSnapshot
	readonly scanMatcher: PikaScanMatcher
	readonly runtimeCssFilepath: string
	readonly usages: Map<string, UsageRecord[]>
	readonly moduleStates: Map<string, ModuleState>
	readonly scannedSourceIds: Set<string>
	readonly transformedSourceIds: Set<string>
}

export interface ProjectGeneration {
	readonly configRevision: number
	readonly sourceRevision: number
	readonly selectedConfigPath: string | null
	readonly config: ResolvedProjectConfig
	readonly entries: readonly ProjectGenerationEntry[]
	readonly dependencies: readonly ProjectDependency[]
	readonly fnNameRouting: ProjectRoutingTable<ProjectGenerationEntry>
	readonly cssModuleRouting: ProjectRoutingTable<ProjectGenerationEntry>
	readonly knownModules: readonly KnownModule[]
}

export interface ProjectActivationEffects {
	readonly sourceIds: readonly string[]
	readonly cssModules: readonly string[]
	readonly runtimeCssFilepaths: readonly string[]
}

export interface ProjectWatchState {
	readonly active: readonly ProjectDependency[]
	readonly recovery: readonly ProjectDependency[]
	readonly armed: readonly ProjectDependency[]
}

export interface ProjectRuntimeOptions {
	readonly projectRoot: string
	readonly config?: string
	readonly mode: 'live' | 'oneshot' | (() => 'live' | 'oneshot')
	readonly onDiagnostic?: DiagnosticHandler
	readonly armDependencies?: (dependencies: readonly ProjectDependency[]) => void | Promise<void>
	readonly createEntryPlugins?: (entry: ResolvedProjectEntry, entryIndex: number) => readonly EnginePlugin[]
	/** Integration-private seam for P2/P3 fallible candidate preparation before activation. */
	readonly prepareActivation?: (candidate: ProjectGeneration) => void | Promise<void>
	/** Host-neutral effects are emitted only after the active generation swaps. */
	readonly onActivated?: (effects: ProjectActivationEffects, generation: ProjectGeneration) => void | Promise<void>
}

export interface ProjectRuntimeReloadResult {
	readonly status: 'activated' | 'retained-last-good' | 'failed-unready'
	readonly error?: Error
}

interface DerivationFailure extends Error {
	readonly dependencies: readonly ProjectDependency[]
}

function dependencyKey(dependency: ProjectDependency): string {
	return `${dependency.type}\0${dependency.path}`
}

function freezeDependencies(dependencies: Iterable<ProjectDependency>): readonly ProjectDependency[] {
	const byKey = new Map<string, ProjectDependency>()
	for (const dependency of dependencies)
		byKey.set(dependencyKey(dependency), dependency)
	return Object.freeze([...byKey.keys()]
		.sort()
		.map(key => Object.freeze({ ...byKey.get(key)! })))
}

function createRoutingTable<T>(entries: readonly (readonly [string, T])[]): ProjectRoutingTable<T> {
	const map = new Map(entries)
	const snapshot = Object.freeze([...map.entries()]
		.map(([key, value]) => Object.freeze([key, value] as const)))
	return Object.freeze({
		size: map.size,
		get: (key: string) => map.get(key),
		has: (key: string) => map.has(key),
		[Symbol.iterator]: () => snapshot[Symbol.iterator](),
	})
}

function createFailure(message: string, cause: unknown, dependencies: Iterable<ProjectDependency>): DerivationFailure {
	const error = new Error(message, { cause }) as DerivationFailure
	Object.defineProperty(error, 'dependencies', {
		value: freezeDependencies(dependencies),
		enumerable: true,
	})
	return error
}

function mergeEffects(previous: ProjectGeneration | null, next: ProjectGeneration): ProjectActivationEffects {
	const sourceIds = new Set<string>()
	const cssModules = new Set<string>()
	const runtimeCssFilepaths = new Set<string>()
	for (const generation of [previous, next]) {
		if (generation == null)
			continue
		for (const entry of generation.entries) {
			entry.transformedSourceIds.forEach(id => sourceIds.add(id))
			cssModules.add(entry.config.cssModule)
			runtimeCssFilepaths.add(entry.runtimeCssFilepath)
		}
	}
	return Object.freeze({
		sourceIds: Object.freeze([...sourceIds].sort()),
		cssModules: Object.freeze([...cssModules].sort()),
		runtimeCssFilepaths: Object.freeze([...runtimeCssFilepaths].sort()),
	})
}

function snapshotKnownModules(modules: ReadonlyMap<string, KnownModule>): readonly KnownModule[] {
	return Object.freeze([...modules.keys()]
		.sort()
		.map(id => Object.freeze({ ...modules.get(id)! })))
}

function createRuntimeCssFilepath(
	stateDir: string,
	runId: string,
	generationId: string,
	entryIndex: number,
): string {
	return join(stateDir, 'runs', runId, generationId, `entry-${entryIndex}.css`)
}

export function createProjectRuntime(options: ProjectRuntimeOptions) {
	if (!isAbsolute(options.projectRoot))
		throw new Error('ProjectRuntime projectRoot must be absolute')
	if ((options.mode === 'live' || typeof options.mode === 'function') && options.armDependencies == null)
		throw new Error('Live/dynamic ProjectRuntime requires an explicit host armDependencies capability')

	const currentMode = () => typeof options.mode === 'function' ? options.mode() : options.mode
	const projectRoot = normalize(options.projectRoot)
	const runId = `${process.pid}-${randomUUID()}`
	const registry = createDefaultProcessorRegistry()
	const knownModules = new Map<string, KnownModule>()
	const armedDependencies = new Map<string, ProjectDependency>()
	let activeDependencies: readonly ProjectDependency[] = Object.freeze([])
	let recoveryDependencies: readonly ProjectDependency[] = Object.freeze([])
	let activeGeneration: ProjectGeneration | null = null
	let configRevision = 0
	let sourceRevision = 0
	let reloadPromise: Promise<ProjectRuntimeReloadResult> | null = null
	let lastSetupError: Error | null = null

	function captureRevision() {
		return { configRevision, sourceRevision }
	}

	function isStale(revision: ReturnType<typeof captureRevision>): boolean {
		return revision.configRevision !== configRevision || revision.sourceRevision !== sourceRevision
	}

	function getWatchState(): ProjectWatchState {
		return Object.freeze({
			active: activeDependencies,
			recovery: recoveryDependencies,
			armed: freezeDependencies(armedDependencies.values()),
		})
	}

	async function armNewDependencies(dependencies: readonly ProjectDependency[]): Promise<readonly ProjectDependency[]> {
		if (currentMode() !== 'live')
			return Object.freeze([])

		// `armedDependencies` records the append-only native watcher state, while
		// the host also needs the current semantic projection. A dependency may
		// have been armed by an older generation, disappear from the active set,
		// then reappear only as a recovery dependency of a failed candidate. In
		// that case there is no new native watch to add, but the host must still
		// learn that events for the path are semantically relevant again.
		const frozenDependencies = freezeDependencies(dependencies)
		await options.armDependencies!(frozenDependencies)

		const missing = frozenDependencies.filter(dependency => !armedDependencies.has(dependencyKey(dependency)))
		for (const dependency of missing)
			armedDependencies.set(dependencyKey(dependency), dependency)
		return freezeDependencies(missing)
	}

	async function deriveCandidate(revision: ReturnType<typeof captureRevision>): Promise<ProjectGeneration> {
		let loaded
		try {
			loaded = await loadPikaConfig({ projectRoot, config: options.config })
		}
		catch (cause) {
			if (cause instanceof PikaConfigHostError)
				throw createFailure(cause.message, cause, cause.dependencies.all)
			throw createFailure(`Failed to load PikaCSS config: ${cause instanceof Error ? cause.message : String(cause)}`, cause, [])
		}

		const dependencies: ProjectDependency[] = [...loaded.dependencies.all]
		const entryCount = loaded.config.entries.length
		const generationId = randomUUID()
		const entries: ProjectGenerationEntry[] = []

		for (const [entryIndex, entry] of loaded.config.entries.entries()) {
			const extraPlugins = options.createEntryPlugins?.(entry, entryIndex) ?? []
			const provisionalDependencies: ProjectDependency[] = []
			const engineConfig = {
				...entry.engine,
				plugins: [...extraPlugins, ...(entry.engine.plugins ?? [])],
			}
			try {
				const engine = await createEngine(engineConfig, {
					onDiagnostic: options.onDiagnostic,
					host: {
						projectRoot,
						...(loaded.config.authoringForm === 'multi'
							? { privateCssDiscriminator: numberToChars(entryIndex) }
							: {}),
					},
					onConfigDependency: dependency => provisionalDependencies.push(dependency),
					...(loaded.config.authoringForm === 'multi'
						? {
								atomicStyleIdStrategy: ({ index, prefix }) => `${prefix}${numberToChars(index * entryCount + entryIndex)}`,
							}
						: {}),
				})
				dependencies.push(...engine.configDependencies)
				entries.push(Object.freeze({
					index: entryIndex,
					config: entry,
					engine,
					typegenSnapshot: engine.typegen.snapshot,
					scanMatcher: createPikaScanMatcher({ scan: entry.scan, stateDir: loaded.config.stateDir }),
					runtimeCssFilepath: createRuntimeCssFilepath(loaded.config.stateDir, runId, generationId, entryIndex),
					usages: new Map(),
					moduleStates: new Map(),
					scannedSourceIds: new Set<string>(),
					transformedSourceIds: new Set<string>(),
				}))
			}
			catch (cause) {
				throw createFailure(
					`Failed to create PikaCSS Engine for entry ${entryIndex} (${entry.fnName}): ${cause instanceof Error ? cause.message : String(cause)}`,
					cause,
					[...dependencies, ...provisionalDependencies],
				)
			}
		}

		const frozenEntries = Object.freeze(entries)
		return Object.freeze({
			configRevision: revision.configRevision,
			sourceRevision: revision.sourceRevision,
			selectedConfigPath: loaded.selectedConfigPath,
			config: loaded.config,
			entries: frozenEntries,
			dependencies: freezeDependencies(dependencies),
			fnNameRouting: createRoutingTable(frozenEntries.map(entry => [entry.config.fnName, entry] as const)),
			cssModuleRouting: createRoutingTable(frozenEntries.map(entry => [entry.config.cssModule, entry] as const)),
			knownModules: snapshotKnownModules(knownModules),
		})
	}

	async function handleFailure(error: DerivationFailure): Promise<ProjectRuntimeReloadResult> {
		lastSetupError = error
		recoveryDependencies = freezeDependencies([...recoveryDependencies, ...error.dependencies])
		await armNewDependencies(error.dependencies)
		if (currentMode() === 'oneshot')
			throw error
		return Object.freeze({
			status: activeGeneration == null ? 'failed-unready' : 'retained-last-good',
			error,
		})
	}

	async function runReloadLoop(): Promise<ProjectRuntimeReloadResult> {
		while (true) {
			const revision = captureRevision()
			const armedAtStart = new Set(armedDependencies.keys())
			let candidate: ProjectGeneration
			try {
				candidate = await deriveCandidate(revision)
			}
			catch (error) {
				if (isStale(revision))
					continue
				return handleFailure(error as DerivationFailure)
			}

			if (isStale(revision))
				continue

			if (currentMode() === 'live') {
				const missingAtStart = candidate.dependencies.filter(dependency => !armedAtStart.has(dependencyKey(dependency)))
				if (missingAtStart.length > 0) {
					recoveryDependencies = freezeDependencies([...recoveryDependencies, ...missingAtStart])
					await armNewDependencies(missingAtStart)
					continue
				}
			}

			try {
				await options.prepareActivation?.(candidate)
			}
			catch (cause) {
				if (isStale(revision))
					continue
				return handleFailure(createFailure(
					`Failed to prepare PikaCSS candidate activation: ${cause instanceof Error ? cause.message : String(cause)}`,
					cause,
					candidate.dependencies,
				))
			}
			if (isStale(revision))
				continue

			const previous = activeGeneration
			const effects = mergeEffects(previous, candidate)
			// Infallible synchronous activation barrier: no await between route/generation reachability changes.
			activeGeneration = candidate
			activeDependencies = candidate.dependencies
			recoveryDependencies = candidate.dependencies
			lastSetupError = null

			await options.onActivated?.(effects, candidate)
			// A newer request may arrive while the host processes post-activation
			// invalidation. The just-activated generation remains valid, but the
			// coalesced reload promise must continue until the newest revision is
			// also derived instead of dropping that request.
			if (isStale(revision))
				continue
			return Object.freeze({ status: 'activated' })
		}
	}

	function requestReload(): Promise<ProjectRuntimeReloadResult> {
		configRevision++
		if (reloadPromise != null)
			return reloadPromise
		reloadPromise = runReloadLoop()
			.finally(() => {
				reloadPromise = null
			})
		return reloadPromise
	}

	function observeKnownModule(id: string, code: string): boolean {
		const rawPath = id.split(/[?#]/, 1)[0]!
		const hasNonFilesystemScheme = /^[a-z][a-z\d+.-]*:/i.test(rawPath) && !/^[a-z]:[\\/]/i.test(rawPath)
		if (id.startsWith('\0') || hasNonFilesystemScheme)
			return false
		const moduleId = parseModuleId(id, projectRoot)
		if (moduleId.query != null || !registry.has(moduleId.ext))
			return false
		const normalizedId = normalize(moduleId.file)
		const sourceHash = hashSource(code)
		if (knownModules.get(normalizedId)?.sourceHash === sourceHash)
			return true
		knownModules.set(normalizedId, Object.freeze({ id: normalizedId, code, sourceHash }))
		sourceRevision++
		return true
	}

	function dropKnownModule(id: string): boolean {
		const moduleId = parseModuleId(id, projectRoot)
		if (moduleId.query != null)
			return false
		const deleted = knownModules.delete(normalize(moduleId.file))
		if (deleted)
			sourceRevision++
		return deleted
	}

	async function captureGeneration(): Promise<ProjectGeneration> {
		if (activeGeneration != null)
			return activeGeneration
		if (reloadPromise != null)
			await reloadPromise
		if (activeGeneration != null)
			return activeGeneration
		throw lastSetupError ?? new Error('ProjectRuntime has no active ProjectGeneration')
	}

	async function resolveCssModule(cssModule: string): Promise<string | null> {
		const generation = await captureGeneration()
		return generation.cssModuleRouting.get(cssModule)?.runtimeCssFilepath ?? null
	}

	return {
		projectRoot,
		requestReload,
		captureGeneration,
		resolveCssModule,
		observeKnownModule,
		dropKnownModule,
		getWatchState,
		get configRevision() { return configRevision },
		get sourceRevision() { return sourceRevision },
		get hasActiveGeneration() { return activeGeneration != null },
	}
}
