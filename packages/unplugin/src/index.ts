import type { Diagnostic, EngineConfigDependency } from '@pikacss/integration'
import type { RspackCompiler, UnpluginFactory } from 'unplugin'
import type { ViteDevServer } from 'vite'
import type { PluginOptions, ResolvedPluginOptions } from './types'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { consoleDiagnosticHandler, createCtx, getDiagnosticScope, log, runWithDiagnosticScope } from '@pikacss/integration'
import { dirname, resolve } from 'pathe'
import { debounce } from 'perfect-debounce'
import { createUnplugin } from 'unplugin'

export * from './types'
export * from '@pikacss/integration'

const PLUGIN_NAME = 'unplugin-pikacss'

/**
 * Structural shape of the design-token usage report produced by
 * `@pikacss/plugin-design-tokens`'s `engine.designTokens.report()`.
 * @internal
 *
 * @remarks
 * limit: duck-typed to avoid a dependency on the design-tokens plugin. Keep in
 * sync with that package's `DesignTokensReport`.
 */
interface DesignTokensReportShape {
	totalTokens: number
	used: string[]
	unused: string[]
	deprecatedInUse: string[]
	strictViolations: { warning: number, error: number }
}

/**
 * Factory function that produces the bundler-agnostic PikaCSS plugin hooks.
 *
 * @param options - User-supplied plugin configuration. When `undefined`, all defaults apply.
 * @param meta - Unplugin metadata providing the target bundler framework name.
 * @returns An unplugin hooks object consumed by the exported bundler adapters.
 *
 * @remarks
 * This is the core entry-point called by `createUnplugin`. It resolves user options,
 * creates an integration context via `createCtx`, and wires bundler-specific lifecycle
 * hooks (config resolution, dev-server HMR, build transforms, and config file watching).
 * When consumed through the Vite entry, the plugin also declares `enforce: 'pre'`
 * so PikaCSS transforms run before framework compiler plugins even if the user's
 * Vite `plugins` array lists `vue()` before `pikacss()`.
 *
 * @example
 * ```ts
 * import { unpluginFactory } from '@pikacss/unplugin-pikacss'
 * import { createUnplugin } from 'unplugin'
 *
 * const plugin = createUnplugin(unpluginFactory)
 * ```
 */
export const unpluginFactory: UnpluginFactory<PluginOptions | undefined> = (options, meta) => {
	const {
		cwd: userCwd,
		currentPackageName = '@pikacss/unplugin-pikacss',
		config: configOrPath,
		tsCodegen = true,
		scan = {},
		fnName = 'pika',
		transformedFormat = 'string',
		autoCreateConfig = false,
		report = false,
	} = options ?? {}

	const usesLegacyInlineConfig = configOrPath != null && typeof configOrPath === 'object'
	const reportEnabled = report === true || (typeof report === 'object' && report != null)
	const reportOutputPath = (typeof report === 'object' && report != null) ? report.output : undefined

	log.debug('Creating unplugin factory with options:', options)

	// The default include glob covers every extension the AST compiler
	// supports: the full JS family (`JS_PROCESSOR_EXTENSIONS`) plus Vue SFCs.
	// An explicit `scan.include` always wins verbatim.
	const defaultInclude = ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}']

	const resolvedOptions: ResolvedPluginOptions = {
		currentPackageName,
		configOrPath,
		tsCodegen: tsCodegen === true ? 'pika.gen.ts' : tsCodegen,
		scan: {
			include: typeof scan?.include === 'string' ? [scan.include] : (scan?.include || defaultInclude),
			exclude: typeof scan?.exclude === 'string' ? [scan.exclude] : (scan?.exclude || ['node_modules/**', 'dist/**', '.git/**', '.nuxt/**', '.output/**', 'coverage/**']),
		},
		fnName,
		transformedFormat,
		autoCreateConfig,
	}
	log.debug('Resolved plugin options:', resolvedOptions)

	let mode: 'build' | 'serve' = 'build'
	const viteServers = [] as ViteDevServer[]
	const rspackCompilers = [] as RspackCompiler[]

	// Every build/rebuild generation owns its identity and error collection
	// (#115): a failed watch build can no longer poison a later fixed build,
	// and late diagnostics from an older generation may still log live but
	// never append into a newer generation's failure collection.
	interface BuildGeneration {
		id: number
		errors: { diagnostic: Diagnostic, moduleId: string | null }[]
		closed: boolean
	}
	let generationCounter = 0
	let activeGeneration: BuildGeneration | null = null

	// Establishes a generation's async scope around work the adapter starts
	// for it. Nested integration module scopes merge on top, so a diagnostic
	// handler reads both generation and module attribution. The generation
	// must be captured SYNCHRONOUSLY when the work is started — capturing it
	// after an await could observe a newer generation that began while the
	// work was suspended.
	function runWithGeneration<T>(generation: BuildGeneration | null, fn: () => T): T {
		if (generation == null)
			return fn()
		return runWithDiagnosticScope({ generationId: generation.id }, fn)
	}

	// Neutral diagnostic handler threaded into the engine via the integration's
	// `onDiagnostic` seam: log every diagnostic live (warnings surface immediately
	// in dev) and collect error-level ones into the generation the emitting work
	// was started for — attribution comes from async scope, never shared state.
	// limit: a strict error still surfaces at buildEnd, not inline on the
	// producing module (per-module dev-overlay timing is out of scope here).
	const onDiagnostic = (diagnostic: Diagnostic) => {
		consoleDiagnosticHandler(diagnostic)
		if (diagnostic.level !== 'error')
			return
		const scope = getDiagnosticScope()
		const generation = activeGeneration
		// Only work started for the still-open active generation may append to
		// its failure collection; anything else (no scope, an older or already
		// closed generation) was logged above and must not poison a newer build.
		if (generation != null && !generation.closed && scope.generationId === generation.id)
			generation.errors.push({ diagnostic, moduleId: scope.moduleId ?? null })
	}

	// Native watcher registration is host mechanism only. `armedWatchPaths`
	// may remain append-only because most bundlers do not support precise
	// unwatching; `trackedWatchPaths` is the replace-whole active/recovery
	// semantic projection supplied by Integration.
	const armedWatchPaths = new Set<string>()
	const trackedWatchDependencies = new Map<string, EngineConfigDependency>()
	let activeWatchRegistrar: ((path: string) => void) | null = null
	const pendingActivationSourceIds = new Set<string>()
	const pendingActivationCssModules = new Set<string>()
	const pendingActivationRuntimeCssFilepaths = new Set<string>()
	let activationCount = 0
	let pendingActivationInvalidation = false

	function registerHostWatchPath(path: string): void {
		if (armedWatchPaths.has(path))
			return

		let registered = false
		if (activeWatchRegistrar != null) {
			activeWatchRegistrar(path)
			registered = true
		}
		viteServers.forEach((server) => {
			server.watcher.add(path)
			registered = true
		})
		if (mode === 'serve' && !registered)
			throw new Error(`Cannot arm PikaCSS dependency without a live host watcher: ${path}`)
		armedWatchPaths.add(path)
	}

	function dependencyKey(dependency: EngineConfigDependency): string {
		return `${dependency.type}\0${dependency.path}`
	}

	function trackProjectDependency(dependency: EngineConfigDependency): void {
		registerHostWatchPath(dependency.path)
		trackedWatchDependencies.set(dependencyKey(dependency), dependency)
	}

	function armProjectDependencies(dependencies: readonly EngineConfigDependency[]): void {
		for (const dependency of dependencies)
			trackProjectDependency(dependency)
	}

	function isTrackedProjectChange(id: string): boolean {
		const absoluteId = resolve(id)
		for (const dependency of trackedWatchDependencies.values()) {
			const dependencyPath = resolve(dependency.path)
			if (dependency.type === 'file' && absoluteId === dependencyPath)
				return true
			if (dependency.type === 'directory-membership'
				&& (absoluteId === dependencyPath || dirname(absoluteId) === dependencyPath)) {
				return true
			}
		}
		return false
	}

	function recordProjectActivation(activation: {
		readonly sourceIds: readonly string[]
		readonly cssModules: readonly string[]
		readonly runtimeCssFilepaths: readonly string[]
		readonly dependencies: readonly EngineConfigDependency[]
	}): void {
		activationCount++
		pendingActivationInvalidation ||= activationCount > 1
		activation.sourceIds.forEach(id => pendingActivationSourceIds.add(id))
		activation.cssModules.forEach(id => pendingActivationCssModules.add(id))
		activation.runtimeCssFilepaths.forEach(path => pendingActivationRuntimeCssFilepaths.add(path))

		trackedWatchDependencies.clear()
		for (const dependency of activation.dependencies)
			trackProjectDependency(dependency)
	}

	const ctx = createCtx({
		cwd: resolve(userCwd ?? process.cwd()),
		...resolvedOptions,
		onDiagnostic,
		projectHost: {
			mode: () => mode === 'serve' ? 'live' : 'oneshot',
			armDependencies: armProjectDependencies,
			onActivated: recordProjectActivation,
		},
	})

	// Logs a design-token usage summary (and optionally writes the full JSON) at
	// build end. Duck-typed access to the engine augmentation avoids depending on
	// the design-tokens plugin; when it is not registered, this is a no-op.
	async function emitTokenReport(): Promise<void> {
		const producer = ctx.engine as unknown as {
			designTokens?: { report?: () => DesignTokensReportShape }
		}
		const reportFn = producer.designTokens?.report
		if (typeof reportFn !== 'function') {
			log.debug('Design-token report requested, but no design-tokens plugin surface is present.')
			return
		}
		const result = reportFn()
		log.info(`[design-tokens] ${result.totalTokens} tokens, ${result.used.length} used, ${result.unused.length} unused`)
		log.info(`[design-tokens] ${result.deprecatedInUse.length} deprecated in use, ${result.strictViolations.error} strict error(s), ${result.strictViolations.warning} strict warning(s)`)
		if (reportOutputPath != null) {
			const outPath = resolve(ctx.cwd, reportOutputPath)
			await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8')
			log.info(`[design-tokens] report written to ${outPath}`)
		}
	}

	type RuntimeMode = 'build' | 'serve'

	function applyRuntimeContext(nextCwd: string, nextMode: RuntimeMode) {
		if (userCwd == null) {
			ctx.cwd = resolve(nextCwd)
		}
		mode = nextMode
		// Build hard-fails on a bad config; dev keeps serving on the last-good engine.
		ctx.configErrorBehavior = nextMode === 'build' ? 'throw' : 'retain-last-good'
	}

	let pendingCssWrite = false
	let pendingTsWrite = false
	let generatedWritePromise = Promise.resolve()

	function flushPendingGeneratedWrites() {
		generatedWritePromise = generatedWritePromise
			.catch(() => {})
			.then(async () => {
				// Defer while transforms are in flight; the transform handler
				// flushes again once the context reports idle.
				if (!ctx.isIdle)
					return

				const shouldWriteCss = pendingCssWrite
				const shouldWriteTs = pendingTsWrite

				pendingCssWrite = false
				pendingTsWrite = false

				if (shouldWriteCss) {
					try {
						await ctx.writeCssCodegenFile()
					}
					catch (error) {
						pendingCssWrite = true
						if (shouldWriteTs)
							pendingTsWrite = true
						throw error
					}
				}

				if (shouldWriteTs) {
					try {
						await ctx.writeTsCodegenFile()
					}
					catch (error) {
						pendingTsWrite = true
						throw error
					}
				}
			})

		return generatedWritePromise
	}

	// Queued generated-file writes are fire-and-forget: they run from event
	// hook listeners (`createEventHook.trigger` discards listener return
	// values) and `watchChange`, so a rejected flush promise would surface as
	// an unhandled rejection and kill the dev server process (ENOSPC, EBUSY
	// on Windows, read-only dir, ...). `queueCssWrite`/`queueTsWrite` therefore
	// attach a logging rejection handler in the same turn and return `void`,
	// so future call sites cannot silently drop the rejection. The pending
	// flags survive a failed flush, so the next queued write retries. Awaited
	// call sites (the transform handler) use `flushPendingGeneratedWrites()`
	// directly and still propagate failures so builds fail loudly.
	function queueCssWrite(): void {
		pendingCssWrite = true
		scheduleGeneratedWritesFlush()
	}

	function queueTsWrite(): void {
		pendingTsWrite = true
		scheduleGeneratedWritesFlush()
	}

	function scheduleGeneratedWritesFlush(): void {
		flushPendingGeneratedWrites()
			.catch((error: any) => {
				log.error(`Failed to write generated files: ${error?.message ?? error}`, error)
			})
	}

	let unbindHooks: (() => void) | null = null
	function bindHooks() {
		if (unbindHooks != null)
			return

		const offStyleUpdated = ctx.hooks.styleUpdated.on(() => {
			// Canonical ProjectGeneration contexts own runtime-CSS publication and
			// revision ordering inside Integration (#149). Only the temporary inline
			// EngineConfig compatibility path still needs the adapter write queue.
			log.debug('Style updated')
			if (usesLegacyInlineConfig)
				queueCssWrite()
		})
		const offTsCodegenUpdated = ctx.hooks.tsCodegenUpdated.on(() => {
			log.debug('TypeScript code generation updated')
			if (usesLegacyInlineConfig)
				queueTsWrite()
		})
		unbindHooks = () => {
			offStyleUpdated()
			offTsCodegenUpdated()
			unbindHooks = null
		}
	}

	let setupPromise = Promise.resolve()
	let lastSetupCwd: string | null = null
	let pendingSetupCwd: string | null = null
	let pendingReload = false
	function setup(reload = false, watchRegistrar: ((path: string) => void) | null = null) {
		pendingSetupCwd = ctx.cwd
		pendingReload = false
		setupPromise = setupPromise.then(async () => {
			log.debug('Setting up integration context...')
			pendingCssWrite = false
			pendingTsWrite = false
			// generatedWritePromise is intentionally not reset: the promise chain's
			// .catch(() => {}).then(...) recovery means any in-flight flush will see
			// the already-cleared pending flags and become a no-op.
			// Canonical project contexts keep subscriptions live across replacement
			// setup. Semantic work may continue on the last-good generation while a
			// candidate derives, so disconnecting here would lose publication events.
			bindHooks()
			activeWatchRegistrar = watchRegistrar
			try {
				await ctx.setup()
			}
			finally {
				activeWatchRegistrar = null
			}
			lastSetupCwd = ctx.cwd
			pendingSetupCwd = null

			// Integration owns generation replacement semantics. The adapter only
			// consumes the post-activation invalidation identities it was handed.
			const rederived = pendingActivationInvalidation
			const sourceIds = [...pendingActivationSourceIds]
			const cssModuleIds = [...pendingActivationCssModules]
			const runtimeCssFilepaths = [...pendingActivationRuntimeCssFilepaths]

			// Canonical ProjectGeneration setup materializes every physical runtime
			// CSS file before activation; only legacy inline config still publishes
			// CSS through this adapter queue. Typegen uses the same legacy-only path.
			pendingCssWrite = usesLegacyInlineConfig
			pendingTsWrite = usesLegacyInlineConfig
			await flushPendingGeneratedWrites()

			// Legacy inline contexts clear their hook sets during setup; recover that
			// compatibility path without disconnecting canonical ProjectRuntime hooks.
			if (usesLegacyInlineConfig) {
				unbindHooks?.()
				bindHooks()
			}

			if (reload && rederived) {
				if (meta.framework === 'vite') {
					const invalidationIds = [...new Set([...sourceIds, ...cssModuleIds, ...runtimeCssFilepaths])]
					invalidationIds.forEach((id) => {
						viteServers.forEach((server) => {
							// One source file can own several module graph nodes: a Vue
							// SFC's template and style blocks live under their own
							// `?vue&type=...` ids, and `ctx.usages` is keyed by the
							// query-stripped file path, so `getModuleById` alone reaches
							// only the main node. Every node has to be invalidated —
							// see the full-reload note below for why a survivor is not
							// merely stale but wrong.
							for (const mod of collectViteModules(server, id)) {
								log.debug(`Invalidating module: ${mod.url}`)
								server.moduleGraph.invalidateModule(mod)
							}
							// The combined moduleGraph facade above only unions the
							// client and ssr graphs. Custom environments own their
							// own graphs, and a module surviving there across an
							// engine re-derivation would keep class names from a
							// dead atomic-ID generation (#121).
							invalidateCustomEnvironmentModules(server, id)
						})
					})

					// A re-derived engine restarts atomic style id assignment from
					// zero, so the same declaration can come back under a different
					// name and a name can be handed to a different declaration. The
					// regenerated CSS reaches the browser immediately, so any module
					// still served from a previous transform does not just look stale
					// — its class names may now resolve to somebody else's rule, with
					// no error to show for it. A full page reload is the only way to
					// guarantee the browser never holds JS and CSS from two different
					// id generations.
					//
					// The invalidated modules re-transform when the reloaded page
					// requests them, which is also what refills the engine store and
					// the generated CSS. `server.reloadModule` is deliberately not
					// used: it only broadcasts an HMR message (no server-side
					// transform), so it would buy nothing here and its update would be
					// superseded by this reload anyway.
					viteServers.forEach((server) => {
						log.debug('Triggering full page reload after engine re-derivation')
						server.hot.send({ type: 'full-reload' })
					})
				}

				else if (meta.framework === 'rspack') {
					rspackCompilers.forEach((compiler) => {
						if (compiler.watching == null)
							return

						log.debug('Invalidating rspack compiler due to setup changes')

						compiler.watching.invalidateWithChangesAndRemovals(new Set(sourceIds))
						compiler.watching.invalidate()
					})
				}
			}

			if (rederived) {
				pendingActivationInvalidation = false
				pendingActivationSourceIds.clear()
				pendingActivationCssModules.clear()
				pendingActivationRuntimeCssFilepaths.clear()
			}
		})
			// A rejected setup (e.g. reloadModule failing on a transient syntax
			// error) must not poison the promise chain for every later call — in
			// dev. In build mode a failed setup (bad config/engine) must propagate
			// so the bundler fails the build instead of emitting empty CSS.
			.catch((error: any) => {
				if (mode === 'build')
					throw error
				log.error(`Failed to setup integration context: ${error?.message ?? error}`, error)
			})
		return setupPromise
	}
	function ensureSetup(reload = false, watchRegistrar: ((path: string) => void) | null = null) {
		// A config (or config dependency) change may have been observed between
		// builds; make the next build pick it up instead of racing the debounce.
		if (pendingReload)
			return setup(true, watchRegistrar)
		if (!reload && (lastSetupCwd === ctx.cwd || pendingSetupCwd === ctx.cwd))
			return setupPromise
		return setup(reload, watchRegistrar)
	}

	function ensureSemanticReady(watchRegistrar: ((path: string) => void) | null = null) {
		// Semantic handlers may wait for a cold start, but once one generation is
		// ready they must never queue behind a replacement setup. Integration
		// captures the currently-active ProjectGeneration itself; waiting here
		// would let work that started under A observe B after a concurrent reload.
		if (lastSetupCwd === ctx.cwd)
			return Promise.resolve()
		if (pendingSetupCwd === ctx.cwd)
			return setupPromise
		return setup(false, watchRegistrar)
	}
	const debouncedSetup = debounce(setup)

	return {
		name: PLUGIN_NAME,

		enforce: 'pre',

		vite: {
			configResolved: (config) => {
				applyRuntimeContext(config.root, config.command === 'serve' ? 'serve' : 'build')
			},
			configureServer(server) {
				viteServers.push(server as any)
			},
		},
		webpack: (compiler) => {
			applyRuntimeContext(compiler.options.context || process.cwd(), compiler.options.mode === 'development' ? 'serve' : 'build')
		},
		rspack: (compiler) => {
			rspackCompilers.push(compiler)
			applyRuntimeContext(compiler.options.context || process.cwd(), compiler.options.mode === 'development' ? 'serve' : 'build')
		},
		esbuild: {
			async setup(build) {
				applyRuntimeContext(build.initialOptions.absWorkingDir || process.cwd(), mode)

				build.onResolve({ filter: /.*/ }, async (args) => {
					await ensureSemanticReady()
					const filepath = await ctx.resolveCssModule(args.path)
					if (filepath == null)
						return
					log.debug(`Resolved logical CSS module: ${args.path} -> ${filepath}`)
					return { path: filepath, namespace: 'file' }
				})
			},
		},

		async buildStart() {
			log.debug('Plugin buildStart hook triggered')
			log.debug(`Current mode: ${mode}, cwd: ${ctx.cwd}`)

			// A new build/rebuild generation begins at the bundler's build-start
			// boundary. A previous generation that never reached buildEnd (e.g.
			// an aborted watch rebuild) is closed here so its late diagnostics
			// can only log live, never collect.
			if (activeGeneration != null)
				activeGeneration.closed = true
			activeGeneration = { id: ++generationCounter, errors: [], closed: false }

			// Bundlers without a dedicated adapter hook (e.g. Rollup) never call
			// applyRuntimeContext, so reaffirm the error policy from the current
			// mode before setup runs.
			ctx.configErrorBehavior = mode === 'build' ? 'throw' : 'retain-last-good'

			const watchRegistrar = meta.framework === 'esbuild'
				? null
				: (path: string) => this.addWatchFile(path)
			await runWithGeneration(activeGeneration, async () => {
				await ensureSetup(false, watchRegistrar)

				if (mode === 'build') {
					log.debug('Running full CSS code generation in build mode')
					await ctx.fullyCssCodegen()
				}
			})
		},

		resolveId: meta.framework === 'esbuild'
			? undefined
			: async function (id: string) {
				// Capture build-diagnostic attribution before any setup/reload await.
				const generation = activeGeneration
				await runWithGeneration(generation, () => ensureSemanticReady(path => this.addWatchFile(path)))
				const filepath = await ctx.resolveCssModule(id)
				if (filepath == null)
					return null
				log.debug(`Resolved logical CSS module: ${id} -> ${filepath}`)
				return filepath
			},

		transform: {
			filter: {
				get id() {
					return ctx.transformFilter
				},
			},
			async handler(code: string, id: string) {
				// Captured synchronously at entry: this transform belongs to the
				// generation that was active when the bundler started it, even
				// if a rebuild begins while the awaits below are suspended.
				const generation = activeGeneration
				// Only cold readiness is an adapter concern. Once a generation is
				// active, a concurrent reload must not delay this handler: ctx.transform
				// records generation-independent KnownModule truth first and captures
				// the active ProjectGeneration before applying its own scan filter.
				await runWithGeneration(generation, () => ensureSemanticReady(path => this.addWatchFile(path)))
				// Generation attribution comes from async scope; module
				// attribution is added by the integration around its own
				// per-module work, so overlapping transforms cannot clobber
				// each other (#115).
				try {
					return await runWithGeneration(generation, () => ctx.transform(code, id))
				}
				finally {
					// The context already counted this transform as settled here, so
					// isIdle answers whether any OTHER transform is still in flight.
					// Only the last finisher flushes; this may be a second flush call
					// if hooks already queued one, but the pending flags will already
					// be false — safe no-op.
					if (ctx.isIdle) {
						await flushPendingGeneratedWrites()
					}
				}
			},
		},

		async buildEnd() {
			if (mode !== 'build')
				return
			// buildEnd aggregates/fails only its own generation, and the
			// generation closes even when reporting below throws — a late
			// diagnostic from this generation can then only log live.
			const generation = activeGeneration
			try {
				await ctx.waitForIdle()
				// Files whose styles entered the generated CSS during the full scan
				// but that the bundler never reached: dead files or missing imports.
				for (const file of ctx.getScannedButNotTransformedFiles()) {
					log.warn(`Styles from ${file} were included in the generated CSS but the file was never reached by the bundler — dead file or missing import?`)
				}

				// Emitted once here (build mode only), so a dev server never repeats it
				// per HMR update.
				if (reportEnabled)
					await emitTokenReport()

				// Fail the build once, after every module has been transformed, by
				// aggregating every error-level diagnostic collected for THIS
				// generation. limit: not per-module dev-overlay timing — errors
				// surface here, not inline on the producing module.
				if (generation != null && generation.errors.length > 0) {
					const details = generation.errors
						.map(({ diagnostic, moduleId }) => {
							const where = moduleId != null ? ` (${moduleId})` : ''
							const source = diagnostic.plugin != null ? `[${diagnostic.plugin}] ` : ''
							return `  - ${source}${diagnostic.code}${where}: ${diagnostic.message}`
						})
						.join('\n')
					throw new Error(`PikaCSS reported ${generation.errors.length} error diagnostic(s):\n${details}`)
				}
			}
			finally {
				if (generation != null)
					generation.closed = true
			}
		},

		async watchChange(id: string, change?: { event: 'create' | 'update' | 'delete' }) {
			if (change?.event === 'delete') {
				// Source state is generation-owned; dropping the active contribution
				// does not mutate any retired generation still referenced by old work.
				log.debug(`Source file deleted, dropping its state: ${id}`)
				await ctx.dropModule(id)
			}

			if (!isTrackedProjectChange(id))
				return

			log.info(`PikaCSS project dependency changed: ${id}, reloading...`)
			pendingReload = true
			const watchRegistrar = meta.framework === 'esbuild'
				? null
				: (path: string) => this.addWatchFile(path)
			// Reload diagnostics remain attributed to the generation that observed
			// the host event; Integration owns candidate freshness/last-good rules.
			runWithGeneration(activeGeneration, () => debouncedSetup(true, watchRegistrar))
		},
	}
}

/*
 * Vite server-global API inventory (#121) — semantic ownership and the
 * intended per-environment replacement once Vite's Environment API becomes
 * the recommended compatibility substrate. Production code deliberately
 * stays on the stable server-global APIs for the supported Vite range
 * (^7 || ^8); this map is the migration contract, and the environment
 * semantics are already pinned by index.vite-env.test.ts / the
 * future-warning coverage in index.vite-future.test.ts.
 *
 * | current API                          | ownership                    | future replacement                                            |
 * |--------------------------------------|------------------------------|---------------------------------------------------------------|
 * | configResolved / configureServer     | plugin/global lifecycle      | unchanged (not environment-scoped)                            |
 * | server.moduleGraph.getModulesByFile  | per-environment module graph | iterate server.environments[*].moduleGraph.getModulesByFile   |
 * | server.moduleGraph.getModuleById     | per-environment module graph | iterate server.environments[*].moduleGraph.getModuleById      |
 * | server.moduleGraph.invalidateModule  | per-environment module graph | each environment graph invalidates its own nodes              |
 * | server.hot.send({ full-reload })     | client-only HMR channel      | server.environments.client.hot.send (already its alias)      |
 * | server.reloadModule (unused)         | client-only HMR              | rejected — see the full-reload note in setup()               |
 *
 * Ownership invariant across environments (client / ssr / custom): ONE
 * plugin invocation owns ONE IntegrationContext, ONE engine, ONE atomic-ID
 * namespace, and ONE run-scoped pika.css. Environments differ only in
 * module instances/invalidation; on engine re-derivation every
 * environment's nodes must be invalidated, and the user-visible full
 * reload belongs to the client environment's channel.
 */

/**
 * Collects every module graph node that a source file owns.
 * @internal
 *
 * @param server - The Vite dev server whose module graph is queried.
 * @param id - A `ctx.usages` key: an absolute, query-stripped file path.
 * @returns The deduplicated set of modules registered for that file, including query-suffixed variants such as a Vue SFC's `?vue&type=template` node.
 *
 * @remarks Queries Vite's backward-compatible combined `server.moduleGraph`, which unions the `client` and `ssr` environment graphs — invalidating the returned nodes therefore covers both built-in environments. Custom environments are not reached through this facade; the per-environment migration path is recorded in the inventory above.
 */
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
 * Invalidates a source file's nodes in every CUSTOM environment module graph.
 * @internal
 *
 * @param server - The Vite dev server whose environments are inspected.
 * @param id - A `ctx.usages` key: an absolute, query-stripped file path.
 *
 * @remarks
 * `client`/`ssr` are already covered through the combined `server.moduleGraph`
 * facade; this only fills the gap for user-defined environments, whose module
 * instances must not survive an engine re-derivation either (#121). Guarded
 * feature-detection keeps older hosts (or mocked servers in tests) working.
 */
function invalidateCustomEnvironmentModules(server: ViteDevServer, id: string) {
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
		const graph = environment.moduleGraph
		const nodes = new Set<any>()
		graph.getModulesByFile(id)
			?.forEach(mod => nodes.add(mod))
		const byId = graph.getModuleById(id)
		if (byId)
			nodes.add(byId)
		for (const mod of nodes) {
			log.debug(`Invalidating ${name} environment module: ${id}`)
			graph.invalidateModule(mod)
		}
	}
}

/**
 * Pre-built universal bundler plugin for PikaCSS.
 *
 * @remarks
 * Created by passing `unpluginFactory` to `createUnplugin`. Import the bundler-specific
 * sub-path (e.g., `@pikacss/unplugin-pikacss/vite`) for a ready-to-use plugin instance.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import pika from '@pikacss/unplugin-pikacss/vite'
 *
 * export default defineConfig({
 *   plugins: [pika()],
 * })
 * ```
 */
export const unpluginPika = /* #__PURE__ */ createUnplugin(unpluginFactory)

/**
 * Default export — the pre-built {@link unpluginPika} instance.
 *
 * Allows `import pika from 'unplugin-pikacss/<bundler>'` usage.
 */
export default unpluginPika
