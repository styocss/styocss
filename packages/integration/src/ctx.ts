import type { DiagnosticHandler, Engine, EngineConfig, EngineConfigDependency } from '@pikacss/core'
import type { SourceMap } from 'magic-string'
import type { CommittedModule, ModuleState, PreparedModule, Replacement } from './ctx.pipeline'
import type { AnalyzedModule } from './processors/types'
import type { ProjectGeneration, ProjectGenerationEntry, ProjectModuleTransactionState } from './projectRuntime'
import type { SemanticCommitSequencer, SemanticCommitSlot } from './semanticCommitSequencer'
import type { IntegrationContext, IntegrationContextOptions, LoadedConfigResult, UsageRecord } from './types'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { createEngine, defineEnginePlugin } from '@pikacss/core'
import { computed, signal } from 'alien-signals'
import { globbyStream } from 'globby'
import { klona } from 'klona'
import { isPackageExists } from 'local-pkg'
import { dirname, isAbsolute, join, relative, resolve } from 'pathe'
import picomatch from 'picomatch'
import { PikaStaleTransformError, PikaTransformError } from './compiler/errors'
import { analyzeModule, analyzeProjectModule, commitModule, hashSource, isSameUsageList, prepareModule, recommitModule, rewriteModule, rewriteReplacements } from './ctx.pipeline'
import { runWithDiagnosticScope } from './diagnosticScope'
import { createEventHook } from './eventHook'
import { createFnConfig } from './fnConfig'
import { replaceGeneratedFile } from './generatedFileWriter'
import { publishGeneratedState } from './generatedState'
import { consoleDiagnosticHandler, log } from './log'
import { parseModuleId } from './moduleId'
import { createDefaultProcessorRegistry } from './processors/registry'
import { createProjectRuntime } from './projectRuntime'
import { createSemanticCommitSequencer } from './semanticCommitSequencer'
import { generateTsCodegenContent } from './tsCodegen'

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

async function replaceProductionReport(filepath: string, content: string): Promise<void> {
	const parent = dirname(filepath)
	await mkdir(parent, { recursive: true })
	const tempPath = join(parent, `.${process.pid}-${randomUUID()}.pika-report.tmp`)
	try {
		await writeFile(tempPath, content, { encoding: 'utf8', flag: 'wx' })
		await rename(tempPath, filepath)
	}
	catch (error) {
		await unlink(tempPath)
			.catch(() => {})
		throw error
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
	semanticCommits: SemanticCommitSequencer
	pendingSemanticSlots: Map<string, SemanticCommitSlot>
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
			semanticCommits,
			pendingSemanticSlots,
		} = runtime
		const commitDeps = { usages, triggerStyleUpdated }
		const fnConfig = createFnConfig(fnName)

		// Vue SFC sub-requests (`App.vue?vue&type=script`) carry content the
		// whole-SFC transform already rewrote; they are not physical-source
		// transactions and consume no semantic commit slot.
		if (moduleId.query != null && moduleId.query.includes('vue&type='))
			return null

		let state = moduleStates.get(moduleId.file)
		if (state == null) {
			state = { revision: 0, committed: null }
			moduleStates.set(moduleId.file, state)
		}
		const revision = ++state.revision
		const epoch = runtime.epoch
		const staleError = new PikaStaleTransformError({ id: moduleId.file })

		// A newer physical-source revision immediately terminalizes the older
		// slot even if that older operation is still suspended in async prepare.
		// This preserves host encounter ordering without letting obsolete work
		// head-of-line block its replacement.
		pendingSemanticSlots.get(moduleId.file)
			?.cancel(staleError)
		const slot = semanticCommits.allocate()
		pendingSemanticSlots.set(moduleId.file, slot)

		const assertCurrent = () => {
			if (revision !== state.revision || epoch !== runtime.epoch)
				throw staleError
		}
		const commitCurrent = <T>(commit: () => T) => slot.commit(() => {
			assertCurrent()
			return commit()
		})
		const clearContribution = () => {
			state.committed = null
			const hadUsages = usages.delete(moduleId.file)
			if (hadUsages)
				triggerStyleUpdated()
		}

		beginTransform()
		try {
			log.debug(`Transforming file: ${id}`)

			// Falling out of the processor/fn-name fast filter is a successful
			// empty-contribution revision, not an out-of-band deletion. It must be
			// ordered with every other semantic commit so older work cannot resurrect
			// the previous contribution after this operation completes.
			if (!registry.has(moduleId.ext) || !code.includes(fnName)) {
				await commitCurrent(clearContribution)
				return null
			}

			const sourceHash = hashSource(code)
			const cached = state.committed
			if (cached != null && cached.sourceHash === sourceHash) {
				const committed = await commitCurrent(() => {
					recommitModule(cached, commitDeps)
					transformedFiles.add(moduleId.file)
					return cached
				})
				return rewriteModule(code, committed)
			}

			const analyzed = await analyzeModule(code, moduleId, { registry, fnConfig })
			if (analyzed == null || analyzed.calls.length === 0) {
				await commitCurrent(clearContribution)
				return null
			}

			const prepared = await prepareModule(analyzed, { engine, transformedFormat })
			assertCurrent()
			const committed = await commitCurrent(() => {
				const next = commitModule(prepared, { engine, ...commitDeps })
				state.committed = next
				transformedFiles.add(moduleId.file)
				return next
			})
			log.debug(`Transformed ${committed.usageList.length} style usages in ${id}`)
			return rewriteModule(code, committed)
		}
		catch (error) {
			// Prepare/parse failures terminalize this slot without mutation. A slot
			// already committed/cancelled ignores the redundant cancellation.
			slot.cancel(error)
			throw error
		}
		finally {
			if (pendingSemanticSlots.get(moduleId.file) === slot)
				pendingSemanticSlots.delete(moduleId.file)
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
		semanticCommits: createSemanticCommitSequencer(),
		pendingSemanticSlots: new Map(),
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
				// Rebuild the detached candidate from the immutable KnownModule raw
				// snapshot before any candidate output or routing becomes reachable.
				// Every source prepares first; deterministic source slots then commit
				// against only the candidate Engines. A failure therefore leaves the
				// complete previous generation active and untouched.
				await commitProjectBatch(
					candidate,
					candidate.knownModules.map(module => ({ id: module.id, code: module.code })),
					{ publishCss: false, markTransformed: true },
				)
				// Runtime CSS uses generation-unique physical paths and is materialized
				// while the candidate remains unreachable.
				await Promise.all(candidate.entries.map(entry => writeCapturedCss(candidate, entry)))
			},
			async publishActivation(candidate, context) {
				await publishGeneratedState(candidate, {
					host: {
						publicEntryModule: options.currentPackageName,
						...(host?.vueTemplateGlobals === true ? { vueTemplateGlobals: true } : {}),
					},
					onDiagnostic,
					isCurrent: context.isCurrent,
				})
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
				semanticCommits: generation.semanticCommits,
				pendingSemanticSlots: generation.pendingSemanticSlots,
				epoch: 0,
			}
			transformRuntimeByEntry.set(entry, runtime)
		}
		return runtime
	}

	function clearEntryContribution(
		entry: ProjectGenerationEntry,
		file: string,
		runtime: TransformRuntimeState,
		clearTransformed = true,
	): boolean {
		const entryState = entry.moduleStates.get(file) ?? { revision: 0, committed: null }
		entryState.revision++
		entryState.committed = null
		entry.moduleStates.set(file, entryState)
		const hadUsages = entry.usages.delete(file)
		if (hadUsages)
			runtime.triggerStyleUpdated()
		if (clearTransformed)
			entry.transformedSourceIds.delete(file)
		return hadUsages
	}

	function rewriteProjectCommitted(code: string, committed: { readonly replacements: readonly Replacement[] }) {
		return committed.replacements.length === 0
			? null
			: rewriteReplacements(code, committed.replacements)
	}

	function assertPreparedRangesDoNotOverlap(id: string, prepared: readonly PreparedModule[]): void {
		const ranges = prepared.flatMap(module => module.preparedCalls.map(call => ({
			start: call.start,
			end: call.end,
		})))
			.sort((a, b) => a.start - b.start)
		for (let i = 1; i < ranges.length; i++) {
			if (ranges[i]!.start < ranges[i - 1]!.end) {
				throw new PikaTransformError({
					id,
					stage: 'prepare',
					loc: null,
					message: 'Overlapping PikaCSS transform calls owned by different project entries are not supported',
				})
			}
		}
	}

	interface PreparedProjectSource {
		readonly id: string
		readonly file: string
		readonly code: string
		readonly sourceHash: string
		readonly entries: readonly ProjectGenerationEntry[]
		readonly preparedByEntry: readonly (readonly [ProjectGenerationEntry, PreparedModule | null])[]
	}

	function projectEntriesForSource(generation: ProjectGeneration, file: string): ProjectGenerationEntry[] {
		return generation.entries.filter(entry => entry.scanMatcher.matches(file))
	}

	async function prepareProjectSource(
		entries: readonly ProjectGenerationEntry[],
		code: string,
		id: string,
		file: string,
	): Promise<PreparedProjectSource> {
		const moduleId = parseModuleId(id, cwd())
		const analyzedProject = await analyzeProjectModule(code, moduleId, {
			registry,
			fnNames: entries.map(entry => entry.config.fnName),
		})
		const preparedByEntry = await Promise.all(entries.map(async (entry) => {
			const analyzed = analyzedProject?.modules.get(entry.config.fnName)
			if (analyzed == null || analyzed.calls.length === 0)
				return [entry, null] as const
			const prepared = await prepareModule(analyzed, {
				engine: entry.engine,
				transformedFormat: entry.config.transformedFormat,
			})
			return [entry, prepared] as const
		}))
		assertPreparedRangesDoNotOverlap(id, preparedByEntry.flatMap(([, prepared]) => prepared == null ? [] : [prepared]))
		return { id, file, code, sourceHash: hashSource(code), entries, preparedByEntry }
	}

	function commitPreparedProjectSource(
		generation: ProjectGeneration,
		preparedSource: PreparedProjectSource,
		state: ProjectModuleTransactionState,
		options: {
			readonly publishCss: boolean
			readonly markScanned: boolean
			readonly markTransformed: boolean
		},
	) {
		const { file, sourceHash, preparedByEntry } = preparedSource
		const committedByEntry = new Map<number, CommittedModule | null>()
		const replacements: Replacement[] = []
		const changedEntries: ProjectGenerationEntry[] = []
		for (const [entry, prepared] of [...preparedByEntry].sort(([a], [b]) => a.index - b.index)) {
			const runtime = transformRuntime(generation, entry)
			if (prepared == null) {
				if (clearEntryContribution(entry, file, runtime, options.markTransformed))
					changedEntries.push(entry)
				committedByEntry.set(entry.index, null)
				continue
			}
			const previousUsageList = entry.usages.get(file)
			const next = commitModule(prepared, {
				engine: entry.engine,
				usages: entry.usages,
				triggerStyleUpdated: runtime.triggerStyleUpdated,
			})
			const entryState = entry.moduleStates.get(file) ?? { revision: 0, committed: null }
			entryState.revision++
			entryState.committed = next
			entry.moduleStates.set(file, entryState)
			if (options.markScanned)
				entry.scannedSourceIds.add(file)
			if (options.markTransformed)
				entry.transformedSourceIds.add(file)
			committedByEntry.set(entry.index, next)
			replacements.push(...next.replacements)
			if (!isSameUsageList(previousUsageList, next.usageList))
				changedEntries.push(entry)
		}
		replacements.sort((a, b) => a.start - b.start)
		const next = Object.freeze({
			id: file,
			sourceHash,
			committedByEntry,
			replacements: Object.freeze(replacements),
		})
		state.committed = next
		if (options.publishCss) {
			for (const entry of changedEntries)
				void requestCssPublication(generation, entry)
		}
		return next
	}

	interface ProjectSourceInput {
		readonly id: string
		readonly code: string
		/** Whether this source physically exists in the current full-scan snapshot. */
		readonly scanned?: boolean
	}

	interface ProjectBatchOperation {
		readonly input: ProjectSourceInput
		readonly file: string
		readonly entries: readonly ProjectGenerationEntry[]
		readonly state: ProjectModuleTransactionState
		readonly revision: number
		readonly slot: SemanticCommitSlot
	}

	async function commitProjectBatch(
		generation: ProjectGeneration,
		sources: readonly ProjectSourceInput[],
		options: {
			readonly publishCss: boolean
			readonly markScanned?: boolean
			readonly markTransformed?: boolean
		},
	): Promise<void> {
		const operations: ProjectBatchOperation[] = []
		const normalizedSources = [...sources]
			.map(input => ({ input, file: physicalSourcePath(input.id) }))
			.filter(({ file }) => !isGeneratedTsPath(file))
			.sort((a, b) => Number(a.file > b.file) - Number(a.file < b.file))

		for (const { input, file } of normalizedSources) {
			const entries = projectEntriesForSource(generation, file)
			if (entries.length === 0)
				continue
			let state = generation.projectModuleStates.get(file)
			if (state == null) {
				state = { revision: 0, committed: null }
				generation.projectModuleStates.set(file, state)
			}
			const revision = ++state.revision
			const staleError = new PikaStaleTransformError({ id: file })
			generation.pendingSemanticSlots.get(file)
				?.cancel(staleError)
			const slot = generation.semanticCommits.allocate()
			generation.pendingSemanticSlots.set(file, slot)
			operations.push({ input, file, entries, state, revision, slot })
		}

		let prepared: PreparedProjectSource[]
		try {
			prepared = await Promise.all(operations.map(operation => prepareProjectSource(
				operation.entries,
				operation.input.code,
				operation.input.id,
				operation.file,
			)))
		}
		catch (error) {
			for (const operation of operations) {
				operation.slot.cancel(error)
				if (generation.pendingSemanticSlots.get(operation.file) === operation.slot)
					generation.pendingSemanticSlots.delete(operation.file)
			}
			throw error
		}

		try {
			for (let index = 0; index < operations.length; index++) {
				const operation = operations[index]!
				try {
					await operation.slot.commit(() => {
						if (operation.state.revision !== operation.revision)
							throw new PikaStaleTransformError({ id: operation.file })
						commitPreparedProjectSource(
							generation,
							prepared[index]!,
							operation.state,
							{
								publishCss: options.publishCss,
								markScanned: options.markScanned === true && operation.input.scanned !== false,
								markTransformed: options.markTransformed === true,
							},
						)
					})
				}
				catch (error) {
					for (const remaining of operations.slice(index + 1))
						remaining.slot.cancel(error)
					throw error
				}
			}
		}
		finally {
			for (const operation of operations) {
				if (generation.pendingSemanticSlots.get(operation.file) === operation.slot)
					generation.pendingSemanticSlots.delete(operation.file)
			}
		}

		if (options.publishCss)
			await waitForGenerationCssPublications(generation)
	}

	async function collectProjectScanSources(generation: ProjectGeneration): Promise<ProjectSourceInput[]> {
		const files = new Set<string>()
		for (const entry of generation.entries) {
			// A full-scan starts a fresh build-diagnostic epoch: scan-owned Pika
			// sources are rediscovered here, while bundler transforms will repopulate
			// transformedSourceIds after buildStart.
			entry.scannedSourceIds.clear()
			entry.transformedSourceIds.clear()
			const stream = globbyStream([...entry.config.scan.include], {
				ignore: [...entry.config.scan.exclude],
				absolute: true,
				cwd: cwd(),
			})
			for await (const path of stream) {
				const file = String(path)
				if (entry.scanMatcher.matches(file))
					files.add(file)
			}
		}
		const existing = await Promise.all([...files].sort()
			.map(async id => ({ id, code: await readFile(id, 'utf-8'), scanned: true as const })))
		const removed = [...generation.projectModuleStates.keys()]
			.filter(file => !files.has(file) && projectEntriesForSource(generation, file).length > 0)
			.sort()
			.map(id => ({ id, code: '', scanned: false as const }))
		return [...existing, ...removed]
	}

	async function transformProjectModule(
		generation: ProjectGeneration,
		code: string,
		id: string,
		file: string,
	) {
		const moduleId = parseModuleId(id, cwd())
		if (moduleId.query != null && moduleId.query.includes('vue&type='))
			return null
		if (isGeneratedTsPath(file))
			return null

		const entries = projectEntriesForSource(generation, file)
		if (entries.length === 0)
			return null

		let state = generation.projectModuleStates.get(file)
		if (state == null) {
			state = { revision: 0, committed: null }
			generation.projectModuleStates.set(file, state)
		}
		const revision = ++state.revision
		const staleError = new PikaStaleTransformError({ id: file })
		generation.pendingSemanticSlots.get(file)
			?.cancel(staleError)
		const slot = generation.semanticCommits.allocate()
		generation.pendingSemanticSlots.set(file, slot)

		const assertCurrent = () => {
			if (state!.revision !== revision)
				throw staleError
		}
		const commitCurrent = <T>(commit: () => T) => slot.commit(() => {
			assertCurrent()
			return commit()
		})

		beginTransform()
		try {
			const sourceHash = hashSource(code)
			const cached = state.committed
			if (cached?.sourceHash === sourceHash) {
				const committed = await commitCurrent(() => {
					const changedEntries: ProjectGenerationEntry[] = []
					for (const entry of entries) {
						const entryCommitted = cached.committedByEntry.get(entry.index)
						const runtime = transformRuntime(generation, entry)
						if (entryCommitted == null) {
							if (clearEntryContribution(entry, file, runtime))
								changedEntries.push(entry)
							continue
						}
						const previousUsageList = entry.usages.get(file)
						recommitModule(entryCommitted, {
							usages: entry.usages,
							triggerStyleUpdated: runtime.triggerStyleUpdated,
						})
						entry.transformedSourceIds.add(file)
						if (!isSameUsageList(previousUsageList, entryCommitted.usageList))
							changedEntries.push(entry)
					}
					for (const entry of changedEntries)
						void requestCssPublication(generation, entry)
					return cached
				})
				return rewriteProjectCommitted(code, committed)
			}

			const preparedSource = await prepareProjectSource(entries, code, id, file)
			assertCurrent()
			const committed = await commitCurrent(() => commitPreparedProjectSource(
				generation,
				preparedSource,
				state!,
				{ publishCss: true, markScanned: false, markTransformed: true },
			))
			return rewriteProjectCommitted(code, committed)
		}
		catch (error) {
			slot.cancel(error)
			throw error
		}
		finally {
			if (generation.pendingSemanticSlots.get(file) === slot)
				generation.pendingSemanticSlots.delete(file)
			endTransform()
		}
	}

	async function dropProjectModule(generation: ProjectGeneration, file: string): Promise<void> {
		let state = generation.projectModuleStates.get(file)
		if (state == null) {
			state = { revision: 0, committed: null }
			generation.projectModuleStates.set(file, state)
		}
		const revision = ++state.revision
		const staleError = new PikaStaleTransformError({ id: file })
		generation.pendingSemanticSlots.get(file)
			?.cancel(staleError)
		const slot = generation.semanticCommits.allocate()
		generation.pendingSemanticSlots.set(file, slot)

		try {
			await slot.commit(() => {
				if (state!.revision !== revision)
					throw staleError
				const committedByEntry = new Map<number, CommittedModule | null>()
				const changedEntries: ProjectGenerationEntry[] = []
				for (const entry of generation.entries) {
					if (clearEntryContribution(entry, file, transformRuntime(generation, entry)))
						changedEntries.push(entry)
					entry.scannedSourceIds.delete(file)
					committedByEntry.set(entry.index, null)
				}
				state!.committed = Object.freeze({
					id: file,
					sourceHash: hashSource(''),
					committedByEntry,
					replacements: Object.freeze([]),
				})
				for (const entry of changedEntries)
					void requestCssPublication(generation, entry)
			})
		}
		finally {
			if (generation.pendingSemanticSlots.get(file) === slot)
				generation.pendingSemanticSlots.delete(file)
		}
	}

	function physicalSourcePath(id: string): string {
		return parseModuleId(id, cwd()).file
	}

	function isGeneratedTsPath(file: string): boolean {
		const canonical = activeGeneration == null
			? null
			: join(activeGeneration.config.stateDir, 'pika.gen.ts')
		const legacy = tsCodegenFilepath()
		return [canonical, legacy]
			.some(generated => generated != null && resolve(file) === resolve(generated))
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
				'This legacy singular createCtx() projection is only available for a single project entry; '
				+ 'use project routing/runtime entry outputs for multi-entry projects.',
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

	function captureAtomicStyleIdsFromUsages(usages: Map<string, UsageRecord[]>): string[] {
		return [...new Set([...usages.values()]
			.flatMap(records => records.flatMap(record => record.atomicStyleIds)))]
	}

	function captureAtomicStyleIds(entry: ProjectGenerationEntry): string[] {
		return captureAtomicStyleIdsFromUsages(entry.usages)
	}

	async function renderCss(
		runtime: TransformRuntimeState,
		atomicStyleIds = captureAtomicStyleIdsFromUsages(runtime.usages),
	): Promise<string> {
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
		const content = await renderCss(runtime, captureAtomicStyleIds(entry))
		await replaceGeneratedFile(entry.runtimeCssFilepath, content, join(generation.config.stateDir, 'tmp'))
	}

	function requestCssPublication(generation: ProjectGeneration, entry: ProjectGenerationEntry): Promise<void> {
		const publication = entry.cssPublication
		const revision = ++publication.revision
		publication.latestError = null
		const atomicStyleIds = captureAtomicStyleIds(entry)
		const runtime = transformRuntime(generation, entry)
		const task = (async () => {
			const content = await renderCss(runtime, atomicStyleIds)
			await replaceGeneratedFile(
				entry.runtimeCssFilepath,
				content,
				join(generation.config.stateDir, 'tmp'),
				() => activeGeneration === generation && publication.revision === revision,
			)
			if (activeGeneration === generation && publication.revision === revision)
				publication.publishedRevision = revision
		})()
		publication.pending.add(task)
		task.catch((error: unknown) => {
			if (activeGeneration !== generation || publication.revision !== revision)
				return
			const normalized = error instanceof Error ? error : new Error(String(error))
			publication.latestError = { revision, error: normalized }
			log.error(`Failed to publish runtime CSS for ${entry.config.cssModule}: ${normalized.message}`, normalized)
		})
			.finally(() => publication.pending.delete(task))
		return task
	}

	async function waitForGenerationCssPublications(generation: ProjectGeneration): Promise<void> {
		while (true) {
			const pending = generation.entries.flatMap(entry => [...entry.cssPublication.pending])
			if (pending.length === 0)
				break
			await Promise.allSettled(pending)
		}
		for (const entry of generation.entries) {
			const latestError = entry.cssPublication.latestError
			if (latestError != null && latestError.revision === entry.cssPublication.revision)
				throw latestError.error
		}
	}

	async function waitForProjectIdle(): Promise<void> {
		await waitForIdleTransforms()
		const generation = activeGeneration
		if (generation != null)
			await waitForGenerationCssPublications(generation)
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

	async function dropCanonicalModule(id: string): Promise<void> {
		const project = ensureProjectRuntime()
		project.dropKnownModule(id)
		const generation = activeGeneration
		if (generation == null)
			return
		const file = physicalSourcePath(id)
		await dropProjectModule(generation, file)
	}

	function isRelevantProjectChange(id: string): boolean {
		const file = resolve(physicalSourcePath(id))
		const watchState = ensureProjectRuntime()
			.getWatchState()
		return [...watchState.active, ...watchState.recovery].some((dependency) => {
			const dependencyPath = resolve(dependency.path)
			if (dependency.type === 'file')
				return file === dependencyPath
			return file === dependencyPath || dirname(file) === dependencyPath
		})
	}

	async function handleHostChange(id: string, change?: { event: 'create' | 'update' | 'delete' }): Promise<void> {
		if (change?.event === 'delete')
			await dropCanonicalModule(id)
		if (!isRelevantProjectChange(id))
			return
		await requestSetup()
	}

	async function prepareBuild(): Promise<void> {
		const generation = await captureGeneration()
		const sources = await collectProjectScanSources(generation)
		await commitProjectBatch(generation, sources, { publishCss: true, markScanned: true, markTransformed: false })
	}

	async function finalizeProductionReports(): Promise<readonly ProductionReportSummary[]> {
		const generation = await captureGeneration()
		const summaries: ProductionReportSummary[] = []

		for (const entry of generation.entries) {
			if (entry.config.report === false)
				continue

			const designTokens = (entry.engine as unknown as { designTokens?: { report?: () => unknown | PromiseLike<unknown> } }).designTokens
			if (typeof designTokens?.report !== 'function')
				continue

			const rawReport = await designTokens.report()
			const serialized = JSON.stringify(rawReport, null, 2)
			if (serialized === undefined)
				throw new Error(`PikaCSS production report for ${entry.config.fnName} is not JSON serializable`)
			const report = freezeProductionReport(JSON.parse(serialized) as DesignTokensProductionReport)
			const outputPath = entry.config.report.output ?? null
			if (outputPath != null) {
				// Config host normalization resolves report.output against the config
				// directory, so this must not be resolved against the process cwd again.
				await replaceProductionReport(outputPath, `${serialized}\n`)
			}

			summaries.push(Object.freeze({
				entryIndex: entry.index,
				fnName: entry.config.fnName,
				cssModule: entry.config.cssModule,
				domain: 'design-tokens' as const,
				report,
				outputPath,
			}))
		}

		return Object.freeze(summaries)
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
		get tsCodegenFilepath() { return activeGeneration == null ? tsCodegenFilepath() : join(activeGeneration.config.stateDir, 'pika.gen.ts') },
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
		get isIdle() {
			return activeTransforms === 0
				&& (activeGeneration?.entries.every(entry => entry.cssPublication.pending.size === 0) ?? true)
		},
		waitForIdle: waitForProjectIdle,
		async transform(code, id) {
			const project = ensureProjectRuntime()
			// Generation-independent raw source truth is recorded before any
			// readiness wait or semantic filtering.
			project.observeKnownModule(id, code)
			const generation = await captureGeneration()
			const file = physicalSourcePath(id)
			return transformProjectModule(generation, code, id, file)
		},
		async dropModule(id) {
			await dropCanonicalModule(id)
		},
		getScannedButNotTransformedFiles() {
			const generation = activeGeneration
			if (generation == null)
				return []
			const missing = new Set<string>()
			for (const entry of generation.entries) {
				for (const file of entry.scannedSourceIds) {
					if (!entry.transformedSourceIds.has(file))
						missing.add(file)
				}
			}
			return [...missing].sort()
		},
		async getCssCodegenContent() {
			const generation = await captureGeneration()
			const entry = requireSingleEntry(generation)
			return renderCss(transformRuntime(generation, entry))
		},
		async getTsCodegenContent() {
			const generation = await captureGeneration()
			return readFile(join(generation.config.stateDir, 'pika.gen.ts'), 'utf8')
		},
		async writeCssCodegenFile() {
			const generation = await captureGeneration()
			const entry = requireSingleEntry(generation)
			await requestCssPublication(generation, entry)
		},
		async writeTsCodegenFile() {
			const generation = await captureGeneration()
			await publishGeneratedState(generation, {
				host: {
					publicEntryModule: options.currentPackageName,
					...(options.projectHost?.vueTemplateGlobals === true ? { vueTemplateGlobals: true } : {}),
				},
				onDiagnostic,
				isCurrent: () => activeGeneration === generation,
			})
		},
		async fullyCssCodegen() {
			await prepareBuild()
		},
		prepareBuild,
		finalizeProductionReports,
		handleHostChange,
		get setupPromise() { return activeSetupPromise },
		set setupPromise(value) { activeSetupPromise = value },
		setup: requestSetup,
	}

	return ctx
}

/**
 * Creates the repository-private Integration compatibility facade.
 *
 * Canonical host/project behavior is owned by `createPikaCSSContext()`, ProjectRuntime,
 * and `@pikacss/config/host`. This non-exported facade keeps legacy single-entry and
 * inline-config regression coverage isolated from the current adapter-facing contract.
 */
export function createCtx(options: IntegrationContextOptions): IntegrationContext {
	return options.configOrPath != null && typeof options.configOrPath === 'object'
		? createLegacyCtx(options)
		: createProjectCtx(options)
}

/** Snapshot returned by the built-in design-token production report. */
export interface DesignTokensProductionReport {
	/** Total number of design tokens in the captured generation. */
	readonly totalTokens: number
	/** Used design-token names in deterministic report order. */
	readonly used: readonly string[]
	/** Unused design-token names in deterministic report order. */
	readonly unused: readonly string[]
	/** Deprecated token names that remain in use. */
	readonly deprecatedInUse: readonly string[]
	/** Strict-mode violation counts grouped by severity. */
	readonly strictViolations: Readonly<{ warning: number, error: number }>
}

/** Host-presentable result of one Integration-owned final production report. */
export interface ProductionReportSummary {
	/** Zero-based canonical config entry index. */
	readonly entryIndex: number
	/** Pika function name for the reported entry. */
	readonly fnName: string
	/** Logical CSS module routed by the reported entry. */
	readonly cssModule: string
	/** Report domain discriminator. */
	readonly domain: 'design-tokens'
	/** Frozen domain report produced from the captured generation. */
	readonly report: DesignTokensProductionReport
	/** Absolute report output path when configured, otherwise `null`. */
	readonly outputPath: string | null
}

function freezeProductionReport(report: DesignTokensProductionReport): DesignTokensProductionReport {
	return Object.freeze({
		...report,
		used: Object.freeze([...report.used]),
		unused: Object.freeze([...report.unused]),
		deprecatedInUse: Object.freeze([...report.deprecatedInUse]),
		strictViolations: Object.freeze({ ...report.strictViolations }),
	})
}

/**
 * Creates the canonical context used by outer consumer adapters.
 *
 * @remarks
 * This is deliberately a narrow host bootstrap seam. The adapter supplies only
 * the immutable project root, optional config-file path, host identity, and
 * host-mechanics callbacks; Config and Integration retain all project semantics.
 */
export interface PikaCSSContextOptions {
	/** Immutable host project root. */
	readonly projectRoot: string
	/** Explicit project config path, or `undefined` for file auto-discovery. */
	readonly config?: string
	/** Public package identity used by generated artifacts. */
	readonly publicEntryModule: string
	/** Current host mode. */
	readonly mode: () => 'live' | 'oneshot'
	/** Receives Integration diagnostics. */
	readonly onDiagnostic?: DiagnosticHandler
	/** Arms native host watchers for Integration-derived dependencies. */
	readonly armDependencies: (dependencies: readonly EngineConfigDependency[]) => void | Promise<void>
	/** Receives host-neutral activation effects after Integration swaps generations. */
	readonly onActivated?: (activation: {
		readonly sourceIds: readonly string[]
		readonly cssModules: readonly string[]
		readonly runtimeCssFilepaths: readonly string[]
	}) => void | Promise<void>
}

/** Canonical Integration context returned to outer consumer adapters. @internal */
export interface PikaCSSContext {
	/** Host-selected failure policy for project setup/reload. */
	configErrorBehavior: 'throw' | 'retain-last-good'
	/** Derives or re-derives the canonical project runtime. */
	setup: () => Promise<void>
	/** Performs deterministic build discovery and project preparation. */
	prepareBuild: () => Promise<void>
	/** Runs the Integration-owned final production-report operation. */
	finalizeProductionReports: () => Promise<readonly ProductionReportSummary[]>
	/** Forwards an authoritative host filesystem observation into ProjectRuntime. */
	handleHostChange: (id: string, change?: { event: 'create' | 'update' | 'delete' }) => Promise<void>
	/** Transforms one authoritative physical source document. */
	transform: (code: string, id: string) => Promise<{ code: string, map: SourceMap } | null | undefined>
	/** Resolves one exact active logical CSS module to its generation-owned physical file. */
	resolveCssModule: (id: string) => Promise<string | null>
	/** Waits for currently active transform/publication work to settle. */
	waitForIdle: () => Promise<void>
	/** Returns build-scanned physical sources the host never transformed. */
	getScannedButNotTransformedFiles: () => string[]
}

/**
 * Builds the file/auto-config Integration context for a consumer adapter.
 *
 * @param options - Host mechanics and immutable project identity.
 * @returns A canonical Integration context; no inline engine config or adapter semantic options are accepted.
 */
export function createPikaCSSContext(options: PikaCSSContextOptions): PikaCSSContext {
	const integration = createProjectCtx({
		cwd: options.projectRoot,
		currentPackageName: options.publicEntryModule,
		scan: { include: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,vue}'], exclude: [] },
		configOrPath: options.config,
		fnName: 'pika',
		transformedFormat: 'string',
		tsCodegen: 'pika.gen.ts',
		autoCreateConfig: false,
		onDiagnostic: options.onDiagnostic,
		projectHost: {
			mode: options.mode,
			vueTemplateGlobals: isPackageExists('vue', { paths: [options.projectRoot] }),
			armDependencies: options.armDependencies,
			onActivated: options.onActivated == null
				? undefined
				: activation => options.onActivated!({
					sourceIds: activation.sourceIds,
					cssModules: activation.cssModules,
					runtimeCssFilepaths: activation.runtimeCssFilepaths,
				}),
		},
	})

	return {
		get configErrorBehavior() { return integration.configErrorBehavior },
		set configErrorBehavior(value) { integration.configErrorBehavior = value },
		setup: integration.setup,
		prepareBuild: integration.prepareBuild!,
		finalizeProductionReports: integration.finalizeProductionReports!,
		handleHostChange: integration.handleHostChange!,
		transform: integration.transform,
		resolveCssModule: integration.resolveCssModule,
		waitForIdle: integration.waitForIdle,
		getScannedButNotTransformedFiles: integration.getScannedButNotTransformedFiles,
	}
}
