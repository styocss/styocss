import type { Diagnostic } from '@pikacss/integration'
import type { RspackCompiler, UnpluginFactory } from 'unplugin'
import type { ViteDevServer } from 'vite'
import type { PluginOptions, ResolvedPluginOptions } from './types'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { consoleDiagnosticHandler, createCtx, getDiagnosticScope, log, runWithDiagnosticScope } from '@pikacss/integration'
import { resolve } from 'pathe'
import { debounce } from 'perfect-debounce'
import { createUnplugin } from 'unplugin'

export * from './types'
export * from '@pikacss/integration'

const RE_VIRTUAL_PIKA_CSS_ID = /^pika\.css$/

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

	const ctx = createCtx({
		cwd: resolve(userCwd ?? process.cwd()),
		...resolvedOptions,
		onDiagnostic,
	})

	// `ctx.engine` throws before the first successful setup; identity comparison
	// of the returned instance is what tells a real re-derivation apart from the
	// retain-last-good path, where the engine object is left in place.
	function currentEngine() {
		try {
			return ctx.engine
		}
		catch {
			return null
		}
	}

	// Last-seen content of every file a plugin registered through
	// `engine.addConfigDependency`. The context already does this for the config
	// file itself (`ctx.resolvedConfigContent`); mirroring it here keeps a bare
	// `touch`, or a save that changes nothing, from re-deriving the engine and
	// reloading the page.
	// limit: assumes identical bytes produce an identical engine — the same
	// assumption the config-file check has always made. A dependency that reads
	// an env var, the clock, or an unregistered file breaks it.
	// limit: the snapshot is read just after `ctx.setup()` returns, not by the
	// engine as it consumes the file, so a write landing inside that window is
	// recorded as already-seen and its reload is skipped. Closing it would mean
	// having the engine report the bytes it actually read. The window is short
	// and a later edit recovers; a watcher configured with a long
	// `awaitWriteFinish` widens it.
	const configDependencyContents = new Map<string, string | null>()
	// Config dependencies discovered AFTER setup (#122): a watchable icon
	// collection's backing file, for example, is first seen while resolving
	// inside engine.use() during a module transform — long after buildStart
	// registered the initial dependency set. Vite dev servers get the path
	// added to their watcher immediately; other bundlers pick it up from the
	// pending set on the next transform's addWatchFile flush.
	const pendingWatchFiles = new Set<string>()

	function registerLateDependency(path: string) {
		// Baseline for watchChange's content-compare: without it, a later
		// event on this path would have no snapshot to diff against.
		configDependencyContents.set(path, readFileOrNull(path))
		pendingWatchFiles.add(path)
		viteServers.forEach((server) => {
			server.watcher.add(path)
			log.debug(`Added late config dependency to vite watcher: ${path}`)
		})
	}
	function readFileOrNull(path: string) {
		try {
			return readFileSync(path, 'utf-8')
		}
		catch {
			// Deleted or unreadable: recorded as null so the next readable state
			// counts as a change.
			return null
		}
	}
	function snapshotConfigDependencies() {
		const deps = currentEngine()?.configDependencies
		if (deps == null)
			return
		configDependencyContents.clear()
		for (const dep of deps)
			configDependencyContents.set(dep, readFileOrNull(dep))
	}

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

	const debouncedWriteCssCodegenFile = debounce(async () => {
		await ctx.writeCssCodegenFile()
	}, 300)

	const debouncedWriteTsCodegenFile = debounce(async () => {
		await ctx.writeTsCodegenFile()
	}, 300)
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
						await debouncedWriteCssCodegenFile()
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
						await debouncedWriteTsCodegenFile()
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

	let hooksBound = false
	function bindHooks() {
		if (hooksBound)
			return
		hooksBound = true

		ctx.hooks.styleUpdated.on(() => {
			log.debug(`Style updated, ${ctx.engine.store.atomicStyleIds.size} atomic styles generated`)
			queueCssWrite()
		})
		ctx.hooks.tsCodegenUpdated.on(() => {
			log.debug('TypeScript code generation updated')
			queueTsWrite()
		})
		ctx.hooks.dependencyAdded.on((path) => {
			log.debug(`Config dependency discovered after setup: ${path}`)
			registerLateDependency(path)
		})
	}

	let setupPromise = Promise.resolve()
	let lastSetupCwd: string | null = null
	let pendingSetupCwd: string | null = null
	let pendingReload = false
	function setup(reload = false) {
		pendingSetupCwd = ctx.cwd
		pendingReload = false
		setupPromise = setupPromise.then(async () => {
			log.debug('Setting up integration context...')
			const moduleIds = Array.from(ctx.usages.keys())
			const previousEngine = currentEngine()
			pendingCssWrite = false
			pendingTsWrite = false
			// generatedWritePromise is intentionally not reset: the promise chain's
			// .catch(() => {}).then(...) recovery means any in-flight flush will see
			// the already-cleared pending flags and become a no-op.
			hooksBound = false
			await ctx.setup()
			lastSetupCwd = ctx.cwd
			pendingSetupCwd = null

			// `ctx.setup()` swaps in a new engine only when it actually built one.
			// A config edit that fails to evaluate takes the retain-last-good path
			// instead: the engine, its store, and every usage survive untouched, so
			// no atomic style id moved and there is nothing to reload. Reloading
			// anyway would throw away the page's state on every typo mid-edit.
			const rederived = currentEngine() !== previousEngine

			// Snapshot the dependency contents the live engine actually consumed —
			// it read them inside `ctx.setup()` just above, so this must happen
			// before the debounced writes below, or an edit landing in between
			// would be recorded as already-seen and never reloaded. Skipping the
			// refresh when the engine was retained is what makes the watcher
			// self-healing: the stale snapshot keeps disagreeing with the file
			// until a setup finally succeeds.
			if (rederived)
				snapshotConfigDependencies()

			await debouncedWriteCssCodegenFile()
			await debouncedWriteTsCodegenFile()
			bindHooks()

			if (reload && rederived) {
				if (meta.framework === 'vite') {
					moduleIds.forEach((id) => {
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

						compiler.watching.invalidateWithChangesAndRemovals(new Set(moduleIds))
						compiler.watching.invalidate()
					})
				}
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
	function ensureSetup(reload = false) {
		// A config (or config dependency) change may have been observed between
		// builds; make the next build pick it up instead of racing the debounce.
		if (pendingReload)
			return setup(true)
		if (!reload && (lastSetupCwd === ctx.cwd || pendingSetupCwd === ctx.cwd))
			return setupPromise
		return setup(reload)
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

				// Handle virtual module resolution
				build.onResolve(
					{
						filter: RE_VIRTUAL_PIKA_CSS_ID,
					},
					(args) => {
						log.debug(`Resolved virtual CSS module: ${args.path} -> ${ctx.cssCodegenFilepath}`)
						return {
							path: ctx.cssCodegenFilepath,
							namespace: 'file',
						}
					},
				)
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

			await runWithGeneration(activeGeneration, async () => {
				await ensureSetup()

				if (mode === 'build') {
					log.debug('Running full CSS code generation in build mode')
					await ctx.fullyCssCodegen()
				}
			})

			// esbuild's buildStart context does not support addWatchFile and
			// would throw; esbuild has no watch-based reload path here anyway.
			if (meta.framework === 'esbuild')
				return

			if (ctx.resolvedConfigPath != null) {
				this.addWatchFile(ctx.resolvedConfigPath)
				log.debug(`Added watch file: ${ctx.resolvedConfigPath}`)
			}

			for (const dep of ctx.engine.configDependencies ?? []) {
				this.addWatchFile(dep)
				log.debug(`Added config dependency watch file: ${dep}`)
			}
		},

		resolveId: meta.framework === 'esbuild'
			? undefined
			: async function (id: string) {
				if (RE_VIRTUAL_PIKA_CSS_ID.test(id)) {
					// A pending config reload may re-run setup here; its
					// diagnostics belong to the generation that started this
					// resolution (captured synchronously, like the transform).
					const generation = activeGeneration
					await runWithGeneration(generation, () => ensureSetup())
					log.debug(`Resolved virtual CSS module: ${id} -> ${ctx.cssCodegenFilepath}`)
					return ctx.cssCodegenFilepath
				}
				return null
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
				// A pending config reload may re-run setup inside ensureSetup;
				// its diagnostics belong to this generation too.
				await runWithGeneration(generation, () => ensureSetup())
				// The declarative filter above is baked once by the bundler
				// adapter (relative patterns resolve against process.cwd()),
				// so cwd-dependent excludes — the codegen outputs and ids like
				// node_modules under a Vite root differing from the shell cwd —
				// must be re-checked against the current ctx.cwd at call time.
				if (!ctx.isTransformTarget(id))
					return null
				if (meta.framework === 'webpack' && ctx.resolvedConfigPath != null) {
					this.addWatchFile(ctx.resolvedConfigPath)
					log.debug(`Added watch file: ${ctx.resolvedConfigPath}`)
				}
				// Generation attribution comes from async scope; module
				// attribution is added by the integration around its own
				// per-module work, so overlapping transforms cannot clobber
				// each other (#115).
				try {
					return await runWithGeneration(generation, () => ctx.transform(code, id))
				}
				finally {
					// Late-discovered config dependencies (#122): register them with
					// this bundler's watcher through the transform context. Vite dev
					// already added them to its server watcher directly; esbuild has
					// no watch path (its context throws on addWatchFile).
					if (meta.framework !== 'esbuild' && pendingWatchFiles.size > 0) {
						for (const path of pendingWatchFiles)
							this.addWatchFile(path)
						pendingWatchFiles.clear()
					}
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

		watchChange(id: string, change?: { event: 'create' | 'update' | 'delete' }) {
			if (change?.event === 'delete') {
				// Drop styles contributed by deleted source files so they do not
				// linger in the generated CSS until the next full rebuild.
				// dropModule normalizes the id and queues regeneration itself
				// (through the ctx hooks bound above) only when styles existed.
				log.debug(`Source file deleted, dropping its state: ${id}`)
				ctx.dropModule(id)
			}
			if (id === ctx.resolvedConfigPath) {
				let currentContent: string | null = null
				try {
					currentContent = readFileSync(id, 'utf-8')
				}
				catch {
					// Deleted or unreadable: treat as changed so the context
					// re-runs config discovery instead of crashing the watcher.
				}
				if (currentContent !== ctx.resolvedConfigContent) {
					log.info('Configuration file changed, reloading...')
					pendingReload = true
					// Reload diagnostics attribute to the currently active
					// generation (async context survives the debounce timer). In
					// build-watch, between two builds the previous generation is
					// already closed, so they log live only — a genuinely broken
					// config still fails the NEXT build via the build-mode
					// `configErrorBehavior = 'throw'` setup rethrow.
					runWithGeneration(activeGeneration, () => debouncedSetup(true))
				}
				return
			}
			// currentEngine() is null before the first setup; nothing to reload.
			if (currentEngine()?.configDependencies?.has(id) !== true)
				return

			// Same content-comparison rule the config file gets: re-deriving is
			// what reassigns every atomic style id, so it must not be triggered by
			// a save that changed nothing.
			// The map is written only by a successful setup, never here: recording
			// bytes the engine may never consume (the setup below can fail and
			// retain the previous engine) would make an unchanged re-save look
			// like a no-op and strand the engine on the old contents.
			if (readFileOrNull(id) === configDependencyContents.get(id)) {
				log.debug(`Config dependency touched but unchanged, skipping reload: ${id}`)
				return
			}
			log.info(`Config dependency changed: ${id}, reloading...`)
			pendingReload = true
			// Same attribution rule as the config-file reload above.
			runWithGeneration(activeGeneration, () => debouncedSetup(true))
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
