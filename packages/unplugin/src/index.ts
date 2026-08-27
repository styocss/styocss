import type { Diagnostic, EngineConfigDependency, PikaCSSContext } from '@pikacss/integration'
import type { RspackCompiler, UnpluginFactory } from 'unplugin'
import type { ViteDevServer } from 'vite'
import type { InternalPluginOptions } from './internal-host'
import type { PluginOptions } from './types'
import process from 'node:process'
import { consoleDiagnosticHandler, createPikaCSSContext, getDiagnosticScope, log, runWithDiagnosticScope } from '@pikacss/integration'
import { resolve } from 'pathe'
import { PIKACSS_HOST_PUBLIC_ENTRY_MODULE } from './internal-host'

export * from './types'
export * from '@pikacss/integration'

const PLUGIN_NAME = 'unplugin-pikacss'
const SUPPORTED_FRAMEWORKS = ['vite', 'rollup', 'rolldown', 'webpack', 'rspack'] as const

type SupportedFramework = typeof SUPPORTED_FRAMEWORKS[number]

function isSupportedFramework(framework: string): framework is SupportedFramework {
	return (SUPPORTED_FRAMEWORKS as readonly string[]).includes(framework)
}
const PUBLIC_ENTRY_MODULE = '@pikacss/unplugin-pikacss'
const TRANSFORM_FILTER = {
	include: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'],
	exclude: [],
}

/**
 * Shared factory for the officially supported PikaCSS bundler hosts.
 *
 * @param options - The optional project config path and host project root.
 * @param meta - Unplugin metadata identifying one of the supported Rollup-family or Webpack-family hosts.
 * @returns An unplugin hooks object consumed by the exported bundler adapters.
 *
 * @remarks
 * Only Vite, Rollup, Rolldown, Webpack, and Rspack are supported. The adapter is intentionally a host shell. Config loading, project
 * generations, source semantics, CSS publication, and TypeScript publication
 * are owned by Integration. This factory only supplies immutable host identity,
 * observes host lifecycle events, and maps Integration effects to host APIs.
 */
const unpluginFactoryImpl: UnpluginFactory<PluginOptions | undefined> = (options, meta) => {
	if (!isSupportedFramework(meta.framework))
		throw new Error(`Unsupported PikaCSS bundler host: ${meta.framework}. Supported hosts: ${SUPPORTED_FRAMEWORKS.join(', ')}`)

	const internalOptions = options as InternalPluginOptions | undefined
	const userCwd = options?.cwd
	const config = options?.config
	const publicEntryModule = internalOptions?.[PIKACSS_HOST_PUBLIC_ENTRY_MODULE] ?? PUBLIC_ENTRY_MODULE
	let mode: 'build' | 'serve' = 'build'
	let projectRoot: string | null = null
	let ctx: PikaCSSContext | null = null

	const viteServers = [] as ViteDevServer[]
	const rspackCompilers = [] as RspackCompiler[]
	const armedWatchPaths = new Set<string>()
	let activeWatchRegistrar: ((path: string) => void) | null = null
	let activationCount = 0

	// Every build/rebuild generation owns its diagnostic collection. A late
	// diagnostic from an older generation may still be displayed, but cannot
	// poison the generation currently ending.
	interface BuildGeneration {
		id: number
		errors: { diagnostic: Diagnostic, moduleId: string | null }[]
		closed: boolean
		productionReportsFinalized: boolean
	}
	let generationCounter = 0
	let activeGeneration: BuildGeneration | null = null

	function runWithGeneration<T>(generation: BuildGeneration | null, fn: () => T): T {
		if (generation == null)
			return fn()
		return runWithDiagnosticScope({ generationId: generation.id }, fn)
	}

	function closeGeneration(generation: BuildGeneration | null): void {
		if (generation != null)
			generation.closed = true
	}

	function onDiagnostic(diagnostic: Diagnostic): void {
		consoleDiagnosticHandler(diagnostic)
		if (diagnostic.level !== 'error')
			return
		const scope = getDiagnosticScope()
		const generation = activeGeneration
		if (generation != null && !generation.closed && scope.generationId === generation.id)
			generation.errors.push({ diagnostic, moduleId: scope.moduleId ?? null })
	}

	function resolveProjectRoot(hostRoot?: string): string {
		const nextRoot = resolve(userCwd ?? hostRoot ?? projectRoot ?? process.cwd())
		if (projectRoot != null && projectRoot !== nextRoot)
			throw new Error(`PikaCSS project root is immutable for this plugin invocation: ${projectRoot} !== ${nextRoot}`)
		projectRoot = nextRoot
		return nextRoot
	}

	function recordProjectActivation(activation: {
		readonly sourceIds: readonly string[]
		readonly cssModules: readonly string[]
		readonly runtimeCssFilepaths: readonly string[]
	}): void {
		// Integration has already swapped the complete semantic generation. The
		// adapter only invalidates host module graph nodes for a replacement.
		activationCount++
		if (activationCount === 1)
			return

		const invalidationIds = [...new Set([
			...activation.sourceIds,
			...activation.cssModules,
			...activation.runtimeCssFilepaths,
		])]
		if (meta.framework === 'vite') {
			for (const id of invalidationIds) {
				for (const server of viteServers) {
					for (const mod of collectViteModules(server, id)) {
						log.debug(`Invalidating module: ${mod.url}`)
						server.moduleGraph.invalidateModule(mod)
					}
					invalidateCustomEnvironmentModules(server, id)
				}
			}
			// A replacement restarts atomic style identity. A full reload keeps
			// browser JavaScript and the newly published runtime CSS coherent.
			for (const server of viteServers) {
				log.debug('Triggering full page reload after engine re-derivation')
				server.hot.send({ type: 'full-reload' })
			}
		}
		else if (meta.framework === 'rspack') {
			for (const compiler of rspackCompilers) {
				if (compiler.watching == null)
					continue
				log.debug('Invalidating rspack compiler due to setup changes')
				compiler.watching.invalidateWithChangesAndRemovals(new Set(activation.sourceIds))
				compiler.watching.invalidate()
			}
		}
	}

	function armProjectDependencies(dependencies: readonly EngineConfigDependency[]): void {
		for (const dependency of dependencies) {
			const path = resolve(dependency.path)
			if (armedWatchPaths.has(path))
				continue

			let registered = false
			if (activeWatchRegistrar != null) {
				activeWatchRegistrar(path)
				registered = true
			}
			for (const server of viteServers) {
				server.watcher.add(path)
				registered = true
			}
			if (mode === 'serve' && !registered)
				throw new Error(`Cannot arm PikaCSS dependency without a live host watcher: ${path}`)
			armedWatchPaths.add(path)
		}
	}

	function ensureContext(hostRoot?: string): PikaCSSContext {
		const root = resolveProjectRoot(hostRoot)
		if (ctx != null)
			return ctx
		ctx = createPikaCSSContext({
			projectRoot: root,
			...(config == null ? {} : { config }),
			publicEntryModule,
			mode: () => mode === 'serve' ? 'live' : 'oneshot',
			onDiagnostic,
			armDependencies: armProjectDependencies,
			onActivated: recordProjectActivation,
		})
		return ctx
	}

	function applyRuntimeContext(hostRoot: string, nextMode: 'build' | 'serve'): void {
		resolveProjectRoot(hostRoot)
		mode = nextMode
		if (ctx != null)
			ctx.configErrorBehavior = nextMode === 'build' ? 'throw' : 'retain-last-good'
	}

	let setupStarted = false
	let setupPromise: Promise<void> | null = null

	function startSetup(watchRegistrar: ((path: string) => void) | null): Promise<void> {
		setupStarted = true
		const context = ensureContext()
		context.configErrorBehavior = mode === 'build' ? 'throw' : 'retain-last-good'
		activeWatchRegistrar = watchRegistrar
		const generation = activeGeneration
		setupPromise = Promise.resolve()
			.then(() => runWithGeneration(generation, () => context.setup()))
			.finally(() => {
				if (activeWatchRegistrar === watchRegistrar)
					activeWatchRegistrar = null
			})
		return setupPromise
	}

	function ensureSemanticReady(watchRegistrar: ((path: string) => void) | null = null): Promise<void> {
		if (setupStarted)
			return Promise.resolve()
		return startSetup(watchRegistrar)
	}

	async function finalizeSuccessfulProductionBuild(generation: BuildGeneration | null): Promise<void> {
		if (mode !== 'build' || generation == null || generation.closed || generation.productionReportsFinalized)
			return
		const context = ensureContext()
		await context.waitForIdle()

		// A host may invoke its completion hook more than once while unwinding a
		// failed build. Final reports are a single project-level operation per
		// successful production build, so mark the generation before invoking
		// the potentially failing producer/output pipeline.
		generation.productionReportsFinalized = true
		const reports = await context.finalizeProductionReports()
		for (const summary of reports) {
			const report = summary.report
			log.info(`[design-tokens:${summary.fnName}] ${report.totalTokens} tokens, ${report.used.length} used, ${report.unused.length} unused`)
			log.info(`[design-tokens:${summary.fnName}] ${report.deprecatedInUse.length} deprecated in use, ${report.strictViolations.error} strict error(s), ${report.strictViolations.warning} strict warning(s)`)
			if (summary.outputPath != null)
				log.info(`[design-tokens:${summary.fnName}] report written to ${summary.outputPath}`)
		}
	}

	async function assertSuccessfulProductionUsage(generation: BuildGeneration | null): Promise<void> {
		if (mode !== 'build')
			return
		const context = ensureContext()
		await context.waitForIdle()
		for (const file of context.getScannedButNotTransformedFiles())
			log.warn(`Styles from ${file} were included in the generated CSS but the file was never reached by the bundler — dead file or missing import?`)
		if (generation == null || generation.errors.length === 0)
			return
		const details = generation.errors
			.map(({ diagnostic, moduleId }) => {
				const where = moduleId != null ? ` (${moduleId})` : ''
				const source = diagnostic.plugin != null ? `[${diagnostic.plugin}] ` : ''
				return `  - ${source}${diagnostic.code}${where}: ${diagnostic.message}`
			})
			.join('\n')
		throw new Error(`PikaCSS reported ${generation.errors.length} error diagnostic(s):\n${details}`)
	}

	async function finishProductionBuild(generation: BuildGeneration | null): Promise<void> {
		try {
			await finalizeSuccessfulProductionBuild(generation)
		}
		finally {
			closeGeneration(generation)
		}
	}

	async function rollupFamilyBuildEnd(error?: unknown): Promise<void> {
		const generation = activeGeneration
		if (error != null) {
			closeGeneration(generation)
			return
		}
		await assertSuccessfulProductionUsage(generation)
	}

	async function rollupFamilyWriteBundle(this: { meta?: { watchMode?: boolean } }): Promise<void> {
		const generation = activeGeneration
		if (this.meta?.watchMode === true || mode !== 'build') {
			closeGeneration(generation)
			return
		}
		await finishProductionBuild(generation)
	}

	return {
		name: PLUGIN_NAME,
		enforce: 'pre',

		vite: {
			configResolved: (configResolved) => {
				applyRuntimeContext(configResolved.root, configResolved.command === 'serve' ? 'serve' : 'build')
			},
			configureServer(server) {
				viteServers.push(server as ViteDevServer)
			},
			buildEnd: rollupFamilyBuildEnd,
			writeBundle: rollupFamilyWriteBundle,
		},
		rollup: {
			buildEnd: rollupFamilyBuildEnd,
			writeBundle: rollupFamilyWriteBundle,
		},
		rolldown: {
			buildEnd: rollupFamilyBuildEnd,
			writeBundle: rollupFamilyWriteBundle,
		},
		webpack: (compiler) => {
			applyRuntimeContext(compiler.options.context || process.cwd(), compiler.options.mode === 'development' ? 'serve' : 'build')
			compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async (compilation: { errors: readonly unknown[] }) => {
				const generation = activeGeneration
				if (compilation.errors.length > 0) {
					closeGeneration(generation)
					return
				}
				await finishProductionBuild(generation)
			})
		},
		rspack: (compiler) => {
			rspackCompilers.push(compiler)
			applyRuntimeContext(compiler.options.context || process.cwd(), compiler.options.mode === 'development' ? 'serve' : 'build')
			compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async (compilation: { errors: readonly unknown[] }) => {
				const generation = activeGeneration
				if (compilation.errors.length > 0) {
					closeGeneration(generation)
					return
				}
				await finishProductionBuild(generation)
			})
		},
		async buildStart() {
			const context = ensureContext()
			closeGeneration(activeGeneration)
			activeGeneration = { id: ++generationCounter, errors: [], closed: false, productionReportsFinalized: false }
			context.configErrorBehavior = mode === 'build' ? 'throw' : 'retain-last-good'
			const watchRegistrar = (path: string) => this.addWatchFile(path)
			await runWithGeneration(activeGeneration, async () => {
				await ensureSemanticReady(watchRegistrar)
				if (mode === 'build')
					await context.prepareBuild()
			})
		},

		async resolveId(id: string) {
			const generation = activeGeneration
			await runWithGeneration(generation, () => ensureSemanticReady(path => this.addWatchFile(path)))
			const filepath = await ensureContext()
				.resolveCssModule(id)
			if (filepath == null)
				return null
			log.debug(`Resolved logical CSS module: ${id} -> ${filepath}`)
			return filepath
		},

		transform: {
			filter: {
				get id() {
					return TRANSFORM_FILTER
				},
			},
			async handler(code: string, id: string) {
				const generation = activeGeneration
				await runWithGeneration(generation, () => ensureSemanticReady(path => this.addWatchFile(path)))
				return runWithGeneration(generation, () => ensureContext()
					.transform(code, id))
			},
		},

		async buildEnd() {
			// Rollup-family adapters replace this generic hook with their native
			// buildEnd above. Webpack-family adapters call it before the late
			// host-specific completion seam, so it remains a diagnostics-only gate.
			await assertSuccessfulProductionUsage(activeGeneration)
		},

		async watchChange(id: string, change?: { event: 'create' | 'update' | 'delete' }) {
			const context = ensureContext()
			const watchRegistrar = (path: string) => this.addWatchFile(path)
			activeWatchRegistrar = watchRegistrar
			try {
				await runWithGeneration(activeGeneration, () => context.handleHostChange(id, change))
			}
			finally {
				if (activeWatchRegistrar === watchRegistrar)
					activeWatchRegistrar = null
			}
		},
	}
}

/**
 * Collects every module graph node that a source file owns.
 * @internal
 */
/**
 * Shared factory primitive for the five officially supported bundler hosts.
 *
 * @remarks
 * The public structural type intentionally does not expose Unplugin's all-host
 * factory type. Supported adapter subpaths bind this implementation back to
 * Unplugin internally; root authoring/Typegen consumers therefore do not acquire
 * type dependencies on unsupported bundler hosts.
 */
export const unpluginFactory: (
	options: PluginOptions | undefined,
	meta: { readonly framework: SupportedFramework },
) => unknown = unpluginFactoryImpl as unknown as (
	options: PluginOptions | undefined,
	meta: { readonly framework: SupportedFramework },
) => unknown

function collectViteModules(server: ViteDevServer, id: string) {
	const modules = new Set<NonNullable<ReturnType<ViteDevServer['moduleGraph']['getModuleById']>>>()
	server.moduleGraph.getModulesByFile(id)
		?.forEach(mod => modules.add(mod))
	const byId = server.moduleGraph.getModuleById(id)
	if (byId)
		modules.add(byId)
	return [...modules]
}

/**
 * Invalidates a source file in custom Vite environment graphs.
 * @internal
 */
function invalidateCustomEnvironmentModules(server: ViteDevServer, id: string): void {
	const environments = server.environments as Record<string, {
		moduleGraph: {
			getModulesByFile: (file: string) => Set<any> | undefined
			getModuleById: (id: string) => any
			invalidateModule: (mod: any) => void
		}
	}> | undefined
	if (environments == null)
		return
	for (const [name, environment] of Object.entries(environments)) {
		if (name === 'client' || name === 'ssr')
			continue
		const nodes = new Set<any>()
		environment.moduleGraph.getModulesByFile(id)
			?.forEach(mod => nodes.add(mod))
		const byId = environment.moduleGraph.getModuleById(id)
		if (byId)
			nodes.add(byId)
		for (const mod of nodes) {
			log.debug(`Invalidating ${name} environment module: ${id}`)
			environment.moduleGraph.invalidateModule(mod)
		}
	}
}
