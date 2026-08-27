import type { Engine, EngineConfig } from '@pikacss/core'
import type { ModuleState, PreparedModule } from './ctx.pipeline'
import type { AnalyzedModule } from './processors/types'
import type { ProjectGeneration, ProjectGenerationEntry } from './projectRuntime'
import type { IntegrationContext, IntegrationContextOptions, LoadedConfigResult, UsageRecord } from './types'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { createEngine, defineEnginePlugin } from '@pikacss/core'
import { computed, signal } from 'alien-signals'
import { globbyStream } from 'globby'
import { klona } from 'klona'
import { isPackageExists } from 'local-pkg'
import { dirname, isAbsolute, join, relative, resolve } from 'pathe'
import picomatch from 'picomatch'
import { PikaStaleTransformError } from './compiler/errors'
import { analyzeModule, commitModule, hashSource, prepareModule, recommitModule, rewriteModule } from './ctx.pipeline'
import { runWithDiagnosticScope } from './diagnosticScope'
import { createEventHook } from './eventHook'
import { createFnConfig } from './fnConfig'
import { replaceGeneratedFile } from './generatedFileWriter'
import { consoleDiagnosticHandler, log } from './log'
import { parseModuleId } from './moduleId'
import { createDefaultProcessorRegistry } from './processors/registry'
import { createProjectRuntime } from './projectRuntime'
import { generateTsCodegenContent, renderTsCodegenContent } from './tsCodegen'

interface Signal<T> {
	(): T
	(value: T): void
}

interface Computed<T> {
	(): T
}

function useInlineConfig(configOrPath: EngineConfig) {
	const resolvedConfig = signal(configOrPath as EngineConfig | null)
	const resolvedConfigPath = signal(null as string | null)
	const resolvedConfigContent = signal(null as string | null)
	const configLoadError = signal(null as Error | null)

	async function loadConfig(): Promise<LoadedConfigResult> {
		try {
			const config = klona(configOrPath)
			resolvedConfig(config)
			configLoadError(null)
			return { config, file: null, content: null }
		}
		catch (error: any) {
			resolvedConfig(null)
			configLoadError(error)
			log.error(`Failed to clone inline config: ${error.message}`, error)
			return { config: null, file: null, content: null }
		}
	}

	return {
		resolvedConfig,
		resolvedConfigPath,
		resolvedConfigContent,
		configLoadError,
		loadConfig,
	}
}

/**
 * PikaCSS internal live working state under the effective project root.
 * Deliberately NOT under `node_modules` or bundler cache directories so the
 * runtime CSS stays watchable by dev servers for HMR.
 */
const RUNTIME_STATE_DIRNAME = '.pikacss'

function usePaths({
	cwd: _cwd,
	tsCodegen,
}: {
	cwd: string
	tsCodegen: false | string
}) {
	const cwd = signal(_cwd)
	// One opaque run id per integration invocation: the physical runtime CSS
	// is invocation-owned, so concurrent processes sharing one project root
	// can never overwrite each other's class-to-rule mapping.
	const runId = `${process.pid}-${randomUUID()}`
	const cssCodegenFilepath = computed(() => join(cwd(), RUNTIME_STATE_DIRNAME, 'runs', runId, 'pika.css'))
	const tsCodegenFilepath = computed(() => tsCodegen === false ? null : (isAbsolute(tsCodegen) ? resolve(tsCodegen) : join(cwd(), tsCodegen)))

	return {
		cwd,
		cssCodegenFilepath,
		tsCodegenFilepath,
	}
}

interface TransformRuntimeState {
	engine: Engine
	fnName: string
	transformedFormat: 'string' | 'array'
	usages: Map<string, UsageRecord[]>
	moduleStates: Map<string, ModuleState>
	scannedFilesWithUsages: Set<string>
	transformedFiles: Set<string>
	triggerStyleUpdated: () => void
	epoch: number
}

function useTransform({
	cwd,
	tsCodegenFilepath,
	scan,
	getRuntime,
	beginTransform,
	endTransform,
}: {
	scan: {
		include: string[]
		exclude: string[]
	}
	cwd: Signal<string>
	tsCodegenFilepath: Signal<string | null>
	getRuntime: () => TransformRuntimeState | null
	beginTransform: () => void
	endTransform: () => void
}) {
	const registry = createDefaultProcessorRegistry()

	function dropRuntimeModule(runtime: TransformRuntimeState, file: string) {
		runtime.moduleStates.delete(file)
		const hadUsages = runtime.usages.delete(file)
		if (hadUsages)
			runtime.triggerStyleUpdated()
	}

	function dropModule(id: string, capturedRuntime?: TransformRuntimeState) {
		const runtime = capturedRuntime ?? getRuntime()
		if (runtime == null)
			return
		dropRuntimeModule(runtime, parseModuleId(id, cwd()).file)
	}

	async function transform(code: string, id: string, capturedRuntime?: TransformRuntimeState) {
		const runtime = capturedRuntime ?? getRuntime()
		if (runtime == null)
			return null

		const moduleId = parseModuleId(id, cwd())
		// The runtime object is captured once at operation entry. A later
		// ProjectGeneration activation cannot redirect this work to another
		// Engine or another generation's mutable module/usage state.
		return runWithDiagnosticScope({ moduleId: moduleId.file }, () => transformModule(code, id, runtime, moduleId))
	}

	async function transformModule(code: string, id: string, runtime: TransformRuntimeState, moduleId: ReturnType<typeof parseModuleId>) {
		const {
			engine,
			fnName,
			transformedFormat,
			usages,
			moduleStates,
			transformedFiles,
			triggerStyleUpdated,
		} = runtime
		const commitDeps = { usages, triggerStyleUpdated }
		const fnConfig = createFnConfig(fnName)

		// Vue SFC sub-requests (`App.vue?vue&type=script`) carry content the
		// whole-SFC transform already rewrote; analyzing them again under
		// hard-error semantics would be a footgun.
		if (moduleId.query != null && moduleId.query.includes('vue&type='))
			return null

		// Source fast filter (extension + fn-name substring): decides only
		// whether to parse, never correctness. Every legal/illegal reserved-root
		// source form contains the configured `fnName`, so there are no false negatives.
		if (!registry.has(moduleId.ext) || !code.includes(fnName)) {
			if (usages.has(moduleId.file))
				dropRuntimeModule(runtime, moduleId.file)
			return null
		}

		const sourceHash = hashSource(code)
		const cached = moduleStates.get(moduleId.file)
		if (cached?.committed != null && cached.committed.sourceHash === sourceHash) {
			recommitModule(cached.committed, commitDeps)
			transformedFiles.add(moduleId.file)
			return rewriteModule(code, cached.committed)
		}

		beginTransform()
		try {
			log.debug(`Transforming file: ${id}`)

			let state = moduleStates.get(moduleId.file)
			if (state == null) {
				state = { revision: 0, committed: null }
				moduleStates.set(moduleId.file, state)
			}
			const revision = ++state.revision
			const epoch = runtime.epoch

			const analyzed = await analyzeModule(code, moduleId, { registry, fnConfig })
			if (analyzed == null || analyzed.calls.length === 0) {
				if (revision === state.revision && epoch === runtime.epoch) {
					state.committed = null
					if (usages.has(moduleId.file))
						dropRuntimeModule(runtime, moduleId.file)
				}
				return null
			}

			const prepared = await prepareModule(analyzed, { engine, transformedFormat })
			if (revision !== state.revision || epoch !== runtime.epoch) {
				log.debug(`Discarding stale prepare for ${id}`)
				throw new PikaStaleTransformError({ id: moduleId.file })
			}
			const committed = commitModule(prepared, { engine, ...commitDeps })
			state.committed = committed
			transformedFiles.add(moduleId.file)
			log.debug(`Transformed ${committed.usageList.length} style usages in ${id}`)
			return rewriteModule(code, committed)
		}
		finally {
			endTransform()
		}
	}

	async function fullScan(filePaths: string[], capturedRuntime?: TransformRuntimeState) {
		const runtime = capturedRuntime ?? getRuntime()
		if (runtime == null)
			return
		const {
			engine,
			fnName,
			transformedFormat,
			usages,
			moduleStates,
			scannedFilesWithUsages,
			transformedFiles,
			triggerStyleUpdated,
		} = runtime
		const fnConfig = createFnConfig(fnName)
		const commitDeps = { usages, triggerStyleUpdated }
		const sorted = [...filePaths].sort()
		scannedFilesWithUsages.clear()
		transformedFiles.clear()

		beginTransform()
		try {
			const analyzedList = Array.from<AnalyzedModule | null>({ length: sorted.length })
				.fill(null)
			const concurrency = 16
			for (let i = 0; i < sorted.length; i += concurrency) {
				await Promise.all(sorted.slice(i, i + concurrency)
					.map(async (filePath, offset) => runWithDiagnosticScope({ moduleId: filePath }, async () => {
						const code = await readFile(filePath, 'utf-8')
						analyzedList[i + offset] = await analyzeModule(code, parseModuleId(filePath, cwd()), { registry, fnConfig })
					})))
			}

			const preparedList = Array.from<PreparedModule | null>({ length: analyzedList.length })
				.fill(null)
			for (let i = 0; i < analyzedList.length; i += concurrency) {
				await Promise.all(analyzedList.slice(i, i + concurrency)
					.map(async (analyzed, offset) => {
						if (analyzed == null || analyzed.calls.length === 0)
							return
						await runWithDiagnosticScope({ moduleId: analyzed.id }, async () => {
							preparedList[i + offset] = await prepareModule(analyzed, { engine, transformedFormat })
						})
					}))
			}

			for (const prepared of preparedList) {
				if (prepared == null)
					continue
				runWithDiagnosticScope({ moduleId: prepared.id }, () => {
					const committed = commitModule(prepared, { engine, ...commitDeps })
					const state = moduleStates.get(prepared.id) ?? { revision: 0, committed: null }
					state.revision++
					state.committed = committed
					moduleStates.set(prepared.id, state)
					scannedFilesWithUsages.add(prepared.id)
				})
			}
		}
		finally {
			endTransform()
		}
	}

	return {
		transformFilter: {
			get include() {
				return scan.include
			},
			get exclude() {
				return [
					...scan.exclude,
					`${RUNTIME_STATE_DIRNAME}/**`,
					...(tsCodegenFilepath() ? [relative(cwd(), tsCodegenFilepath()!)] : []),
				]
			},
		},
		transform,
		fullScan,
		dropModule,
	}
}

interface PatternMatcher {
	matches: (path: string) => boolean
	isAbsolutePattern: boolean
}

function useTransformTarget({
	cwd,
	cssCodegenFilepath,
	tsCodegenFilepath,
	scan,
}: {
	cwd: Signal<string>
	cssCodegenFilepath: Computed<string>
	tsCodegenFilepath: Computed<string | null>
	scan: {
		include: string[]
		exclude: string[]
	}
}) {
	// Patterns are fixed at context creation; only the base directory used to
	// resolve relative ids and patterns follows `cwd`, so the matchers can be
	// built once.
	const toMatchers = (patterns: string[]): PatternMatcher[] => patterns.map(pattern => ({
		matches: picomatch(pattern, { dot: true }),
		isAbsolutePattern: isAbsolute(pattern),
	}))
	const includeMatchers = toMatchers(scan.include)
	// `.pikacss/**` is a default source-scanner exclude: internal state files
	// must never become transform/scan inputs, while the runtime CSS itself
	// stays watchable by the bundler (this is not a watcher ignore rule).
	const excludeMatchers = toMatchers([...scan.exclude, `${RUNTIME_STATE_DIRNAME}/**`])

	function isTransformTarget(id: string): boolean {
		// Bundler ids may carry query/hash suffixes (e.g. `App.vue?vue&type=script`).
		const filePath = id.split(/[?#]/, 1)[0]!
		const _cwd = cwd()
		const absoluteId = isAbsolute(filePath) ? resolve(filePath) : resolve(_cwd, filePath)

		// The codegen outputs must never be transformed or scanned: doing so
		// would feed generated content back into style collection.
		if (absoluteId === cssCodegenFilepath())
			return false
		const _tsCodegenFilepath = tsCodegenFilepath()
		if (_tsCodegenFilepath != null && absoluteId === _tsCodegenFilepath)
			return false

		// Relative patterns match against the id relative to the CURRENT cwd;
		// absolute patterns match against the absolute id.
		const relativeId = relative(_cwd, absoluteId)
		const matchesSome = (matchers: PatternMatcher[]) => matchers.some(
			({ matches, isAbsolutePattern }) => matches(isAbsolutePattern ? absoluteId : relativeId),
		)
		return matchesSome(includeMatchers) && !matchesSome(excludeMatchers)
	}

	return { isTransformTarget }
}

/**
 * Creates an `IntegrationContext` that wires together config loading, engine initialization, source file transformation, and codegen output.
 *
 * @param options - The integration configuration including paths, function name, scan globs, and codegen settings.
 * @returns A fully constructed `IntegrationContext`. Call `setup()` on the returned context before using transforms.
 *
 * The context uses reactive signals internally so that computed paths (CSS and TS codegen
 * file paths) automatically update when `cwd` changes. The `setup()` method must be called
 * before any transform or codegen operations - transform calls automatically await the
 * pending setup promise.
 */
function createLegacyCtx(options: IntegrationContextOptions): IntegrationContext {
	const onDiagnostic = options.onDiagnostic ?? consoleDiagnosticHandler
	const {
		cwd,
		cssCodegenFilepath,
		tsCodegenFilepath,
	} = usePaths(options)

	const {
		resolvedConfig,
		resolvedConfigPath,
		resolvedConfigContent,
		configLoadError,
		loadConfig,
	} = useInlineConfig(options.configOrPath as EngineConfig)

	// Runtime-mutable error policy set by the bundler adapter from the build
	// mode: `throw` (build) hard-fails on config/engine errors; `retain-last-good`
	// (dev) keeps the process alive on the previous engine. Defaults to the dev
	// policy so a bare `createCtx()` never crashes.
	let configErrorBehavior: 'throw' | 'retain-last-good' = 'retain-last-good'

	const usages = new Map<string, UsageRecord[]>()

	// Per-module prepared state keyed by normalized absolute file path: build
	// mode prepares each module once in the fullScan pass and the bundler's own
	// transform pass reuses it via a source-hash hit. Cleared on setup() because
	// cached atomic style ids were minted by the previous engine; the epoch
	// counter additionally prevents an in-flight transform drained by setup()
	// from committing a stale result after the clear.
	const moduleStates = new Map<string, ModuleState>()
	let moduleEpoch = 0
	// Build-mode bookkeeping for the scanned-but-not-transformed warning:
	// physical files whose styles entered the generated CSS during the full
	// scan vs files the bundler's transform pass actually reached.
	const scannedFilesWithUsages = new Set<string>()
	const transformedFiles = new Set<string>()

	const engine = signal(null as Engine | null)
	const legacyTransformRuntime: TransformRuntimeState = {
		engine: null as unknown as Engine,
		fnName: options.fnName,
		transformedFormat: options.transformedFormat,
		usages,
		moduleStates,
		scannedFilesWithUsages,
		transformedFiles,
		triggerStyleUpdated: queueStyleUpdated,
		epoch: 0,
	}
	const hooks = {
		styleUpdated: createEventHook<void>(),
		tsCodegenUpdated: createEventHook<void>(),
	}
	let activeTransforms = 0
	let pendingStyleUpdated = false
	let pendingTsCodegenUpdated = false
	let transformIdleWaiters: (() => void)[] = []

	function waitForIdleTransforms(): Promise<void> {
		if (activeTransforms === 0)
			return Promise.resolve()
		return new Promise((resolveWaiter) => {
			transformIdleWaiters.push(resolveWaiter)
		})
	}

	function notifyTransformsIdle() {
		if (activeTransforms > 0 || transformIdleWaiters.length === 0)
			return
		const waiters = transformIdleWaiters
		transformIdleWaiters = []
		waiters.forEach(resolveWaiter => resolveWaiter())
	}

	function flushPendingUpdates() {
		if (activeTransforms > 0)
			return

		const shouldTriggerStyleUpdated = pendingStyleUpdated
		const shouldTriggerTsCodegenUpdated = pendingTsCodegenUpdated

		pendingStyleUpdated = false
		pendingTsCodegenUpdated = false

		if (shouldTriggerStyleUpdated)
			hooks.styleUpdated.trigger()
		if (shouldTriggerTsCodegenUpdated)
			hooks.tsCodegenUpdated.trigger()
	}

	function queueStyleUpdated() {
		pendingStyleUpdated = true
		flushPendingUpdates()
	}

	const {
		transformFilter,
		transform,
		fullScan,
		dropModule,
	} = useTransform({
		scan: options.scan,
		cwd,
		tsCodegenFilepath,
		getRuntime: () => engine() == null ? null : legacyTransformRuntime,
		beginTransform: () => {
			activeTransforms++
		},
		endTransform: () => {
			if (activeTransforms > 0)
				activeTransforms--
			flushPendingUpdates()
			notifyTransformsIdle()
		},
	})

	const { isTransformTarget } = useTransformTarget({
		cwd,
		cssCodegenFilepath,
		tsCodegenFilepath,
		scan: options.scan,
	})

	const ctx: IntegrationContext = {
		currentPackageName: options.currentPackageName,
		fnName: options.fnName,
		transformedFormat: options.transformedFormat,
		get cwd() { return cwd() },
		set cwd(v) { cwd(v) },
		get configErrorBehavior() { return configErrorBehavior },
		set configErrorBehavior(v) { configErrorBehavior = v },
		get cssCodegenFilepath() { return cssCodegenFilepath() },
		get tsCodegenFilepath() { return tsCodegenFilepath() },
		get hasVue() { return isPackageExists('vue', { paths: [cwd()] }) },
		get resolvedConfig() { return resolvedConfig() },
		get resolvedConfigPath() { return resolvedConfigPath() },
		get resolvedConfigContent() { return resolvedConfigContent() },
		loadConfig,
		usages,
		hooks,
		get engine() {
			const _engine = engine()
			if (_engine == null) {
				throw new Error('Engine is not initialized yet')
			}
			return _engine
		},
		transformFilter,
		isTransformTarget,
		async resolveCssModule(id) {
			return id === 'pika.css' ? cssCodegenFilepath() : null
		},
		get isIdle() { return activeTransforms === 0 },
		waitForIdle: waitForIdleTransforms,
		transform: async (code, id) => {
			await ctx.setupPromise
			// Caching, the source-hash fast path, and the stale-revision/epoch
			// guards all live in the pipeline-backed transform (ModuleState).
			return transform(code, id)
		},
		dropModule,
		getScannedButNotTransformedFiles: () => {
			return [...scannedFilesWithUsages]
				.filter(file => !transformedFiles.has(file))
				.sort()
		},
		getCssCodegenContent: async () => {
			await ctx.setupPromise

			log.debug('Generating CSS code')

			const atomicStyleIds = [...new Set([...ctx.usages.values()].flatMap(i => [...new Set(i.flatMap(i => i.atomicStyleIds))]))]
			log.debug(`Collecting ${atomicStyleIds.length} atomic style IDs`)

			const layerDecl = ctx.engine.renderLayerOrderDeclaration()
			// Scope preflight pruning (variables, keyframes) to the atomic styles
			// still referenced by live usages: the engine store is append-only, so
			// an unfiltered pass would keep emitting declarations for deleted styles.
			// Both passes only read the engine store, so run them concurrently.
			const [preflightsCss, atomicCss] = await Promise.all([
				ctx.engine.renderPreflights(true, { usedAtomicStyleIds: atomicStyleIds }),
				ctx.engine.renderAtomicStyles(true, { atomicStyleIds }),
			])

			const css = [
				`/* Auto-generated by ${ctx.currentPackageName} */`,
				layerDecl,
				preflightsCss,
				atomicCss,
			]
				.filter(s => s.trim() !== '')
				.join('\n')
				.trim()

			return css
		},
		getTsCodegenContent: async () => {
			await ctx.setupPromise

			if (ctx.tsCodegenFilepath == null)
				return null

			const content = await generateTsCodegenContent(ctx)
			return content
		},
		writeCssCodegenFile: async () => {
			await ctx.setupPromise
			const content = await ctx.getCssCodegenContent()
			if (content == null)
				return

			log.debug(`Writing runtime CSS file: ${ctx.cssCodegenFilepath}`)
			await replaceGeneratedFile(ctx.cssCodegenFilepath, content, join(cwd(), RUNTIME_STATE_DIRNAME, 'tmp'))
		},
		writeTsCodegenFile: async () => {
			await ctx.setupPromise
			if (ctx.tsCodegenFilepath == null)
				return

			const content = await ctx.getTsCodegenContent()
			if (content == null)
				return

			log.debug(`Writing TypeScript code generation file: ${ctx.tsCodegenFilepath}`)
			// Same-directory temp: `tsCodegen` may point anywhere (including an
			// absolute path on another filesystem), and rename must stay atomic.
			await replaceGeneratedFile(ctx.tsCodegenFilepath, content, dirname(ctx.tsCodegenFilepath))
		},
		fullyCssCodegen: async () => {
			await ctx.setupPromise

			log.debug('Starting full CSS code generation scan')
			const _cwd = cwd()
			const stream = globbyStream(options.scan.include, { cwd: _cwd, ignore: options.scan.exclude })
			const filePaths: string[] = []
			for await (const entry of stream) {
				const filePath = join(_cwd, entry)
				// `scan.exclude` alone does not cover the codegen outputs; re-check
				// through the same predicate the bundler transform path uses.
				if (!ctx.isTransformTarget(filePath))
					continue
				filePaths.push(filePath)
			}
			await fullScan(filePaths)
			log.debug(`Scanned ${filePaths.length} files for style collection`)
			await ctx.writeCssCodegenFile()
		},
		setupPromise: null,
		setup: () => {
			// Chain onto any in-flight setup so concurrent calls run serially,
			// and only the latest call clears the shared promise.
			const promise: Promise<void> = (ctx.setupPromise ?? Promise.resolve())
				.then(() => setup())
				.catch((error: any) => {
					// Build mode (`throw`) propagates so the bundler fails the build
					// loudly. Dev mode (`retain-last-good`) swallows so a transient
					// bad config edit cannot kill the dev server; the engine stays on
					// its last-good instance (or the default fallback) from setup().
					if (configErrorBehavior === 'throw')
						throw error
					log.error(`Failed to setup integration context: ${error.message}`, error)
				})
				.finally(() => {
					if (ctx.setupPromise === promise)
						ctx.setupPromise = null
				})
			ctx.setupPromise = promise
			return promise
		},
	}

	async function setup() {
		log.debug('Setting up integration context')

		// Build the next engine BEFORE touching live state so a config/engine
		// failure leaves the current engine and usages intact (last-good). Only
		// after a new engine is in hand do we drain, clear, and swap.
		await loadConfig()
		const devPlugin = defineEnginePlugin({
			name: '@pikacss/integration:dev',
			preflightUpdated: queueStyleUpdated,
			atomicStyleAdded: queueStyleUpdated,
		})

		let nextEngine: Engine | null = null
		// A config file that exists but fails to evaluate is a hard input error;
		// treat it the same as an engine-creation failure below.
		let setupError: Error | null = configLoadError()
		if (setupError == null) {
			try {
				const config = resolvedConfig() ?? {}
				config.plugins = config.plugins ?? []
				config.plugins.unshift(devPlugin)
				log.debug('Creating engine with loaded/default config')
				// The integration's effective project root is the host authority for
				// project-relative plugin resources (#118) — not process.cwd().
				nextEngine = await createEngine(config, { onDiagnostic, host: { projectRoot: cwd() } })
			}
			catch (error: any) {
				setupError = error
			}
		}

		if (setupError != null) {
			// Build mode: propagate so the bundler fails loudly instead of
			// emitting CSS from a silently-empty config.
			if (configErrorBehavior === 'throw')
				throw setupError

			// Dev mode: keep serving. If an engine is already live, retain it and
			// every collected usage untouched so the last-good CSS survives the
			// bad edit. Only when there is no last-good engine (first setup) do we
			// fall back to a plugin-only default engine so the dev server can boot.
			if (engine() != null) {
				log.error(`Failed to load config: ${setupError.message}. Retaining last known good engine.`, setupError)
				// The adapter resets its `hooksBound` flag and re-binds after every
				// ctx.setup(); clear here (mirroring the success path) so retained
				// setups do not accumulate duplicate style/codegen listeners.
				hooks.styleUpdated.listeners.clear()
				hooks.tsCodegenUpdated.listeners.clear()
				return
			}
			log.error(`Failed to load config: ${setupError.message}. Falling back to default config.`, setupError)
			nextEngine = await createEngine({ plugins: [devPlugin] }, { onDiagnostic, host: { projectRoot: cwd() } })
		}

		// Drain in-flight transforms before clearing state and swapping the
		// engine: a transform suspended at `engine.use()` would otherwise resume
		// against the old engine and write usages the new engine's store does not
		// know about. Only transforms that already began are drained here — new
		// `ctx.transform()` calls await `ctx.setupPromise` at entry (which is
		// already set to this setup run), so this cannot deadlock.
		await waitForIdleTransforms()
		usages.clear()
		moduleEpoch++
		legacyTransformRuntime.epoch = moduleEpoch
		moduleStates.clear()
		scannedFilesWithUsages.clear()
		transformedFiles.clear()
		pendingStyleUpdated = false
		pendingTsCodegenUpdated = false
		hooks.styleUpdated.listeners.clear()
		hooks.tsCodegenUpdated.listeners.clear()
		engine(nextEngine)
		legacyTransformRuntime.engine = nextEngine!

		log.debug('Integration context setup successfully')
	}

	return ctx
}

/**
 * Canonical project-config context backed by the long-lived ProjectRuntime.
 *
 * @internal
 * @remarks The public IntegrationContext shape is retained only as an H1
 * migration facade. Semantic work below captures a ProjectGeneration/entry
 * once and does not use these compatibility projections as authority.
 */
function createProjectCtx(options: IntegrationContextOptions): IntegrationContext {
	const onDiagnostic = options.onDiagnostic ?? consoleDiagnosticHandler
	const { cwd, cssCodegenFilepath: legacyCssCodegenFilepath, tsCodegenFilepath } = usePaths(options)
	const registry = createDefaultProcessorRegistry()
	const hooks = {
		styleUpdated: createEventHook<void>(),
		tsCodegenUpdated: createEventHook<void>(),
	}
	let configErrorBehavior: 'throw' | 'retain-last-good' = 'retain-last-good'
	let activeTransforms = 0
	let transformIdleWaiters: (() => void)[] = []
	let activeGeneration: ProjectGeneration | null = null
	let activeConfigContent: string | null = null
	let projectRuntime: ReturnType<typeof createProjectRuntime> | null = null
	let projectRuntimeRoot: string | null = null
	let projectRuntimeEpoch = 0
	let activeSetupPromise: Promise<void> | null = null
	const transformRuntimeByEntry = new WeakMap<ProjectGenerationEntry, TransformRuntimeState>()

	function waitForIdleTransforms(): Promise<void> {
		if (activeTransforms === 0)
			return Promise.resolve()
		return new Promise((resolveWaiter) => {
			transformIdleWaiters.push(resolveWaiter)
		})
	}

	function notifyTransformsIdle(): void {
		if (activeTransforms > 0 || transformIdleWaiters.length === 0)
			return
		const waiters = transformIdleWaiters
		transformIdleWaiters = []
		waiters.forEach(resolveWaiter => resolveWaiter())
	}

	function beginTransform(): void {
		activeTransforms++
	}

	function endTransform(): void {
		if (activeTransforms > 0)
			activeTransforms--
		notifyTransformsIdle()
	}

	function readSelectedConfigContent(generation: ProjectGeneration): string | null {
		if (generation.selectedConfigPath == null)
			return null
		try {
			return readFileSync(generation.selectedConfigPath, 'utf8')
		}
		catch {
			return null
		}
	}

	function ownsActiveEngine(engine: Engine | null): boolean {
		return engine != null && activeGeneration?.entries.some(entry => entry.engine === engine) === true
	}

	function createEntryDevPlugin() {
		let owningEngine: Engine | null = null
		return defineEnginePlugin({
			name: '@pikacss/integration:dev',
			configureEngine(configurator) {
				owningEngine = configurator.runtime
			},
			preflightUpdated() {
				if (ownsActiveEngine(owningEngine))
					hooks.styleUpdated.trigger()
			},
			atomicStyleAdded() {
				if (ownsActiveEngine(owningEngine))
					hooks.styleUpdated.trigger()
			},
		})
	}

	function createRuntimeForCurrentRoot(): ReturnType<typeof createProjectRuntime> {
		const projectRoot = resolve(cwd())
		const host = options.projectHost
		const runtimeEpoch = ++projectRuntimeEpoch
		const runtime = createProjectRuntime({
			projectRoot,
			...(typeof options.configOrPath === 'string' ? { config: options.configOrPath } : {}),
			mode: host == null ? 'oneshot' : () => host.mode(),
			onDiagnostic,
			...(host == null ? {} : { armDependencies: host.armDependencies }),
			createEntryPlugins: () => [createEntryDevPlugin()],
			async prepareActivation(candidate) {
				// Runtime CSS uses a generation-unique physical path, so it can be
				// materialized while the candidate is still unreachable. This closes
				// the activation->adapter-write window where logical CSS routing could
				// otherwise expose a path that does not exist yet. A stale candidate's
				// orphaned file is harmless because no active routing table references it.
				await Promise.all(candidate.entries.map(entry => writeCapturedCss(candidate, entry)))
			},
			onActivated(effects, generation) {
				// A runtime from a previous cwd/root may finish after a replacement
				// runtime has already been created. Its own activation remains valid
				// internally, but it is no longer allowed to mutate this facade or host.
				if (runtimeEpoch !== projectRuntimeEpoch)
					return
				// Mirror the ProjectRuntime's already-completed synchronous activation
				// before invoking any awaitable host plumbing. New semantic work can
				// therefore capture this generation immediately.
				activeGeneration = generation
				activeConfigContent = readSelectedConfigContent(generation)
				hooks.styleUpdated.trigger()
				hooks.tsCodegenUpdated.trigger()
				return host?.onActivated?.({
					sourceIds: effects.sourceIds,
					cssModules: effects.cssModules,
					runtimeCssFilepaths: effects.runtimeCssFilepaths,
					dependencies: generation.dependencies,
				})
			},
		})
		projectRuntime = runtime
		projectRuntimeRoot = projectRoot
		return runtime
	}

	function ensureProjectRuntime(): ReturnType<typeof createProjectRuntime> {
		const projectRoot = resolve(cwd())
		if (projectRuntime == null || projectRuntimeRoot !== projectRoot) {
			// A host-root change is a whole-project restart, never a mutation of
			// the previous generation's semantic topology.
			activeGeneration = null
			activeConfigContent = null
			return createRuntimeForCurrentRoot()
		}
		return projectRuntime
	}

	function transformRuntime(generation: ProjectGeneration, entry: ProjectGenerationEntry): TransformRuntimeState {
		let runtime = transformRuntimeByEntry.get(entry)
		if (runtime == null) {
			runtime = {
				engine: entry.engine,
				fnName: entry.config.fnName,
				transformedFormat: entry.config.transformedFormat,
				usages: entry.usages,
				moduleStates: entry.moduleStates,
				scannedFilesWithUsages: entry.scannedSourceIds,
				transformedFiles: entry.transformedSourceIds,
				triggerStyleUpdated() {
					// A retired generation may finish work, but it cannot schedule
					// publication for the generation that replaced it.
					if (activeGeneration === generation)
						hooks.styleUpdated.trigger()
				},
				epoch: 0,
			}
			transformRuntimeByEntry.set(entry, runtime)
		}
		return runtime
	}

	const {
		transform,
		fullScan,
		dropModule: dropTransformModule,
	} = useTransform({
		scan: options.scan,
		cwd,
		tsCodegenFilepath,
		getRuntime: () => null,
		beginTransform,
		endTransform,
	})

	function physicalSourcePath(id: string): string {
		return parseModuleId(id, cwd()).file
	}

	function isGeneratedTsPath(file: string): boolean {
		const generated = tsCodegenFilepath()
		return generated != null && resolve(file) === resolve(generated)
	}

	function isCanonicalTransformTarget(id: string): boolean {
		const parsed = parseModuleId(id, cwd())
		if (!registry.has(parsed.ext) || isGeneratedTsPath(parsed.file))
			return false
		const generation = activeGeneration
		if (generation == null)
			return true
		return generation.entries.some(entry => entry.scanMatcher.matches(parsed.file))
	}

	function requireSingleEntry(generation: ProjectGeneration): ProjectGenerationEntry {
		if (generation.entries.length !== 1) {
			throw new Error(
				'Current createCtx() compatibility transforms do not support multi-entry project transactions yet; '
				+ 'multi-entry module prepare/commit is owned by #149.',
			)
		}
		return generation.entries[0]!
	}

	async function captureGeneration(): Promise<ProjectGeneration> {
		const runtime = ensureProjectRuntime()
		if (activeGeneration != null)
			return activeGeneration

		// Cold start may wait for an in-flight setup, but that promise can belong
		// to a runtime for the previous cwd. Once it settles, explicitly verify
		// that the runtime captured above is ready; otherwise initialize the
		// current root before asking it for a generation.
		if (activeSetupPromise != null)
			await activeSetupPromise
		if (!runtime.hasActiveGeneration)
			await requestSetup()
		return runtime.captureGeneration()
	}

	async function renderCss(runtime: TransformRuntimeState): Promise<string> {
		const atomicStyleIds = [...new Set([...runtime.usages.values()]
			.flatMap(records => records.flatMap(record => record.atomicStyleIds)))]
		const [preflightsCss, atomicCss] = await Promise.all([
			runtime.engine.renderPreflights(true, { usedAtomicStyleIds: atomicStyleIds }),
			runtime.engine.renderAtomicStyles(true, { atomicStyleIds }),
		])
		return [
			`/* Auto-generated by ${options.currentPackageName} */`,
			runtime.engine.renderLayerOrderDeclaration(),
			preflightsCss,
			atomicCss,
		]
			.filter(part => part.trim() !== '')
			.join('\n')
			.trim()
	}

	async function writeCapturedCss(generation: ProjectGeneration, entry: ProjectGenerationEntry): Promise<void> {
		const runtime = transformRuntime(generation, entry)
		const content = await renderCss(runtime)
		await replaceGeneratedFile(entry.runtimeCssFilepath, content, join(generation.config.stateDir, 'tmp'))
	}

	async function setupProjectRuntime(): Promise<void> {
		const result = await ensureProjectRuntime()
			.requestReload()
		if (result.status === 'failed-unready')
			throw result.error ?? new Error('PikaCSS project generation failed before initial activation')
	}

	function requestSetup(): Promise<void> {
		const promise: Promise<void> = (activeSetupPromise ?? Promise.resolve())
			.then(setupProjectRuntime)
			.catch((error: unknown) => {
				if (configErrorBehavior === 'throw')
					throw error
				log.error(`Failed to setup integration context: ${error instanceof Error ? error.message : String(error)}`, error)
			})
			.finally(() => {
				if (activeSetupPromise === promise)
					activeSetupPromise = null
			})
		activeSetupPromise = promise
		return promise
	}

	const ctx: IntegrationContext = {
		currentPackageName: options.currentPackageName,
		get fnName() { return activeGeneration?.entries[0]?.config.fnName ?? options.fnName },
		get transformedFormat() { return activeGeneration?.entries[0]?.config.transformedFormat ?? options.transformedFormat },
		get cwd() { return cwd() },
		set cwd(value) { cwd(value) },
		get configErrorBehavior() { return configErrorBehavior },
		set configErrorBehavior(value) { configErrorBehavior = value },
		get cssCodegenFilepath() { return activeGeneration?.entries[0]?.runtimeCssFilepath ?? legacyCssCodegenFilepath() },
		get tsCodegenFilepath() { return tsCodegenFilepath() },
		get hasVue() { return isPackageExists('vue', { paths: [cwd()] }) },
		get resolvedConfig() { return activeGeneration?.entries[0]?.config.engine ?? null },
		get resolvedConfigPath() { return activeGeneration?.selectedConfigPath ?? null },
		get resolvedConfigContent() { return activeConfigContent },
		async loadConfig() {
			await ctx.setup()
			const generation = await captureGeneration()
			const entry = requireSingleEntry(generation)
			return generation.selectedConfigPath == null
				? { config: entry.config.engine, file: null, content: null }
				: { config: entry.config.engine, file: generation.selectedConfigPath, content: activeConfigContent ?? '' }
		},
		get usages() { return activeGeneration?.entries[0]?.usages ?? new Map<string, UsageRecord[]>() },
		hooks,
		get engine() {
			const engine = activeGeneration?.entries[0]?.engine
			if (engine == null)
				throw new Error('Engine is not initialized yet')
			return engine
		},
		transformFilter: {
			// Canonical configured scans are not known until Config-host loading.
			// Keep the adapter prefilter broad; correctness is checked below with
			// each captured entry's Config-owned scan matcher.
			include: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'],
			exclude: [],
		},
		isTransformTarget: isCanonicalTransformTarget,
		async resolveCssModule(id) {
			const generation = await captureGeneration()
			return generation.cssModuleRouting.get(id)?.runtimeCssFilepath ?? null
		},
		get isIdle() { return activeTransforms === 0 },
		waitForIdle: waitForIdleTransforms,
		async transform(code, id) {
			const project = ensureProjectRuntime()
			// Generation-independent raw source truth is recorded before any
			// readiness wait or semantic filtering.
			project.observeKnownModule(id, code)
			const generation = await captureGeneration()
			const file = physicalSourcePath(id)

			if (generation.entries.length !== 1) {
				const hasOwnedMacro = generation.entries.some(entry => entry.scanMatcher.matches(file) && code.includes(entry.config.fnName))
				if (!hasOwnedMacro)
					return null
				throw new Error(
					'Current createCtx() compatibility transforms do not support multi-entry project transactions yet; '
					+ 'multi-entry module prepare/commit is owned by #149.',
				)
			}

			const entry = generation.entries[0]!
			if (!entry.scanMatcher.matches(file) || isGeneratedTsPath(file))
				return null
			return transform(code, id, transformRuntime(generation, entry))
		},
		dropModule(id) {
			const project = ensureProjectRuntime()
			project.dropKnownModule(id)
			const generation = activeGeneration
			if (generation == null)
				return
			for (const entry of generation.entries)
				dropTransformModule(id, transformRuntime(generation, entry))
		},
		getScannedButNotTransformedFiles() {
			const entry = activeGeneration?.entries[0]
			if (entry == null)
				return []
			return [...entry.scannedSourceIds]
				.filter(file => !entry.transformedSourceIds.has(file))
				.sort()
		},
		async getCssCodegenContent() {
			const generation = await captureGeneration()
			const entry = requireSingleEntry(generation)
			return renderCss(transformRuntime(generation, entry))
		},
		async getTsCodegenContent() {
			if (tsCodegenFilepath() == null)
				return null
			const generation = await captureGeneration()
			const entry = requireSingleEntry(generation)
			return renderTsCodegenContent({
				snapshot: entry.typegenSnapshot,
				fnName: entry.config.fnName,
				transformedFormat: entry.config.transformedFormat,
				publicModule: options.currentPackageName,
			})
		},
		async writeCssCodegenFile() {
			const generation = await captureGeneration()
			const entry = requireSingleEntry(generation)
			await writeCapturedCss(generation, entry)
		},
		async writeTsCodegenFile() {
			const filepath = tsCodegenFilepath()
			if (filepath == null)
				return
			const generation = await captureGeneration()
			const entry = requireSingleEntry(generation)
			const content = renderTsCodegenContent({
				snapshot: entry.typegenSnapshot,
				fnName: entry.config.fnName,
				transformedFormat: entry.config.transformedFormat,
				publicModule: options.currentPackageName,
			})
			await replaceGeneratedFile(filepath, content, dirname(filepath), () => activeGeneration === generation)
		},
		async fullyCssCodegen() {
			const generation = await captureGeneration()
			const entry = requireSingleEntry(generation)
			const runtime = transformRuntime(generation, entry)
			const files: string[] = []
			const stream = globbyStream([...entry.config.scan.include], {
				ignore: [...entry.config.scan.exclude],
				absolute: true,
			})
			for await (const path of stream) {
				const file = String(path)
				if (entry.scanMatcher.matches(file))
					files.push(file)
			}
			await fullScan(files, runtime)
			await writeCapturedCss(generation, entry)
		},
		get setupPromise() { return activeSetupPromise },
		set setupPromise(value) { activeSetupPromise = value },
		setup: requestSetup,
	}

	return ctx
}

/**
 * Creates the Integration migration facade.
 *
 * Canonical file/auto project configuration is owned exclusively by
 * ProjectRuntime + @pikacss/config/host. An inline EngineConfig object remains
 * temporarily isolated on the legacy path until H1 removes that host surface.
 */
export function createCtx(options: IntegrationContextOptions): IntegrationContext {
	return options.configOrPath != null && typeof options.configOrPath === 'object'
		? createLegacyCtx(options)
		: createProjectCtx(options)
}
