import type { Engine, EngineConfig, Nullish } from '@pikacss/core'
import type { ModuleState } from './ctx.pipeline'
import type { AnalyzedModule } from './processors/types'
import type { IntegrationContext, IntegrationContextOptions, LoadedConfigResult, UsageRecord } from './types'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { createEngine, defineEnginePlugin } from '@pikacss/core'
import { computed, signal } from 'alien-signals'
import { globbyStream } from 'globby'
import { klona } from 'klona'
import { isPackageExists } from 'local-pkg'
import { dirname, isAbsolute, join, relative, resolve } from 'pathe'
import picomatch from 'picomatch'
import { analyzeModule, commitModule, hashSource, prepareModule, rewriteModule } from './ctx.pipeline'
import { createEventHook } from './eventHook'
import { createFnConfig } from './fnConfig'
import { consoleDiagnosticHandler, log } from './log'
import { parseModuleId } from './moduleId'
import { createDefaultProcessorRegistry } from './processors/registry'
import { generateTsCodegenContent } from './tsCodegen'

interface Signal<T> {
	(): T
	(value: T): void
}

interface Computed<T> {
	(): T
}

const RE_VALID_CONFIG_EXT = /\.(?:js|cjs|mjs|ts|cts|mts)$/

// Config file candidates checked at the cwd root, in descending priority. The
// `pika` prefix wins over `pikacss`, and TS variants win over JS. Discovery is
// intentionally NOT recursive: a `**/…` glob could pick up a fixture/example
// config in a monorepo, and its result was filesystem-order dependent.
const CONFIG_CANDIDATES = [
	'pika.config.ts',
	'pika.config.mts',
	'pika.config.cts',
	'pika.config.js',
	'pika.config.mjs',
	'pika.config.cjs',
	'pikacss.config.ts',
	'pikacss.config.mts',
	'pikacss.config.cts',
	'pikacss.config.js',
	'pikacss.config.mjs',
	'pikacss.config.cjs',
]

function createConfigScaffoldContent({
	currentPackageName,
	resolvedConfigPath,
	tsCodegenFilepath,
}: {
	currentPackageName: string
	resolvedConfigPath: string
	tsCodegenFilepath: string | Nullish
}) {
	const relativeTsCodegenFilepath = tsCodegenFilepath == null
		? null
		: `./${relative(dirname(resolvedConfigPath), tsCodegenFilepath)}`

	return [
		...relativeTsCodegenFilepath == null
			? []
			: [`/// <reference path="${relativeTsCodegenFilepath}" />`],
		`import { defineEngineConfig } from '${currentPackageName}'`,
		'',
		'export default defineEngineConfig({',
		'  // Add your PikaCSS engine config here',
		'})',
	].join('\n')
}

async function writeGeneratedFile(filepath: string, content: string) {
	await mkdir(dirname(filepath), { recursive: true })
		.catch(() => {})
	await writeFile(filepath, content)
}

/**
 * Rewrites the invocation-owned runtime CSS without ever exposing partial
 * content: byte-identical content skips the filesystem entirely, otherwise
 * the full content lands in a unique same-filesystem temporary file that
 * atomically replaces the target (rename overwrites on both POSIX and
 * Windows via libuv). Temporary files are cleaned up best-effort.
 *
 * The temp file deliberately lives in a dedicated `tempDir` OUTSIDE the
 * watched run directory: creating and renaming the temp inside the same
 * directory as the target can race the directory watcher's event handling
 * (observed on Linux/inotify) and swallow the target's change event, which
 * silently breaks dev CSS HMR for that rewrite.
 */
async function writeRuntimeCssFile(filepath: string, content: string, tempDir: string) {
	await mkdir(dirname(filepath), { recursive: true })
		.catch(() => {})
	const current = await readFile(filepath, 'utf-8')
		.catch(() => null)
	if (current === content)
		return

	await mkdir(tempDir, { recursive: true })
		.catch(() => {})
	const tempPath = join(tempDir, `${process.pid}-${randomUUID()}.tmp`)
	try {
		// Both the temp write and the replacement sit inside the cleanup
		// boundary: a failed/partial temp write must not leave the temp file
		// behind any more than a failed rename may.
		await writeFile(tempPath, content)
		await rename(tempPath, filepath)
	}
	catch (error) {
		await unlink(tempPath)
			.catch(() => {})
		throw error
	}
}

async function evaluateConfigModule(resolvedConfigPath: string): Promise<LoadedConfigResult & { error?: Error }> {
	log.info(`Using config file: ${resolvedConfigPath}`)
	const { createJiti } = await import('jiti')
	const jiti = createJiti(
		import.meta.url,
		{
			interopDefault: true,
			// Without this, files imported by the config are cached process-wide
			// and edits to them would be invisible to config reloads.
			moduleCache: false,
		},
	)
	const content = await readFile(resolvedConfigPath, 'utf-8')
	try {
		const config = (await jiti.evalModule(
			content,
			{
				id: resolvedConfigPath,
				forceTranspile: true,
			},
		) as { default: EngineConfig }).default
		return { config: klona(config), file: resolvedConfigPath, content }
	}
	catch (error: any) {
		// Keep the file path and content so integrations can still watch the
		// config file and reload once the user fixes it. `error` is surfaced so
		// build mode can hard-fail instead of silently falling back to defaults.
		log.error(`Failed to evaluate config file: ${error.message}`, error)
		return { config: null, file: resolvedConfigPath, content, error }
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
	// can never overwrite each other's class-to-rule mapping. Uniqueness
	// comes from the UUID; the pid prefix only aids human debugging. Stale
	// run directories from crashed processes are harmless — correctness
	// never depends on cleanup.
	const runId = `${process.pid}-${randomUUID()}`
	const cssCodegenFilepath = computed(() => join(cwd(), RUNTIME_STATE_DIRNAME, 'runs', runId, 'pika.css'))
	const tsCodegenFilepath = computed(() => tsCodegen === false ? null : (isAbsolute(tsCodegen) ? resolve(tsCodegen) : join(cwd(), tsCodegen)))

	return {
		cwd,
		cssCodegenFilepath,
		tsCodegenFilepath,
	}
}

function useConfig({
	cwd,
	tsCodegenFilepath,
	currentPackageName,
	autoCreateConfig,
	configOrPath,
}: {
	cwd: Signal<string>
	tsCodegenFilepath: Computed<string | Nullish>
	currentPackageName: string
	autoCreateConfig: boolean
	configOrPath: EngineConfig | string | Nullish
}) {
	const specificConfigPath = computed(() => {
		if (
			typeof configOrPath === 'string' && RE_VALID_CONFIG_EXT.test(configOrPath)
		) {
			return isAbsolute(configOrPath) ? configOrPath : join(cwd(), configOrPath)
		}
		return null
	})
	function findFirstExistingConfigPath(): string | null {
		const _cwd = cwd()
		const _specificConfigPath = specificConfigPath()
		const specificConfigFound = _specificConfigPath != null
			&& statSync(_specificConfigPath, { throwIfNoEntry: false })
				?.isFile()
		if (specificConfigFound) {
			return _specificConfigPath
		}

		const found = CONFIG_CANDIDATES
			.map(name => join(_cwd, name))
			.filter(path => statSync(path, { throwIfNoEntry: false })
				?.isFile() === true)
		const [first, ...ignored] = found
		if (first == null)
			return null
		if (ignored.length > 0) {
			log.warn(`Multiple config files found in "${_cwd}". Using "${first}" and ignoring: ${ignored.map(path => `"${path}"`)
				.join(', ')}`)
		}
		return first
	}
	async function ensureConfigPath(candidatePath: string | null) {
		if (candidatePath != null)
			return candidatePath

		if (autoCreateConfig === false) {
			log.warn(
				'No PikaCSS config file found; continuing with the default engine config. '
				+ 'Create a `pika.config.ts` (export default defineEngineConfig({ ... })) '
				+ 'or set `autoCreateConfig: true` to scaffold one automatically.',
			)
			return null
		}

		const resolvedConfigPath = specificConfigPath() ?? join(cwd(), 'pika.config.js')
		await writeGeneratedFile(
			resolvedConfigPath,
			createConfigScaffoldContent({
				currentPackageName,
				resolvedConfigPath,
				tsCodegenFilepath: tsCodegenFilepath(),
			}),
		)
		return resolvedConfigPath
	}
	const inlineConfig = typeof configOrPath === 'object' ? configOrPath : null
	async function _loadConfig(): Promise<LoadedConfigResult & { error?: Error }> {
		try {
			log.debug('Loading engine config')
			if (inlineConfig != null) {
				log.debug('Using inline config')
				return { config: klona(inlineConfig), file: null, content: null }
			}

			const resolvedConfigPath = await ensureConfigPath(findFirstExistingConfigPath())
			if (resolvedConfigPath == null)
				return { config: null, file: null, content: null }

			return await evaluateConfigModule(resolvedConfigPath)
		}
		catch (error: any) {
			log.error(`Failed to load config file: ${error.message}`, error)
			return { config: null, file: null, content: null, error }
		}
	}

	const resolvedConfig = signal(inlineConfig)
	const resolvedConfigPath = signal(null as string | null)
	const resolvedConfigContent = signal(null as string | null)
	// Non-null after a load whose config file existed (or inline config was
	// provided) but failed to evaluate. `null` for a successful load or a
	// legitimate absence (no config file). setup() reads this to decide between
	// hard-failing (build) and retaining last-good (dev).
	const configLoadError = signal(null as Error | null)
	async function loadConfig(): Promise<LoadedConfigResult> {
		const { error, ...result } = await _loadConfig()
		resolvedConfig(result.config)
		resolvedConfigPath(result.file)
		resolvedConfigContent(result.content)
		configLoadError(error ?? null)
		return result
	}

	return {
		resolvedConfig,
		resolvedConfigPath,
		resolvedConfigContent,
		configLoadError,
		loadConfig,
	}
}

function useTransform({
	cwd,
	tsCodegenFilepath,
	scan,
	fnName,
	usages,
	engine,
	transformedFormat,
	beginTransform,
	endTransform,
	triggerStyleUpdated,
	moduleStates,
	getEpoch,
	scannedFilesWithUsages,
	transformedFiles,
}: {
	scan: {
		include: string[]
		exclude: string[]
	}
	fnName: string
	transformedFormat: 'string' | 'array'
	cwd: Signal<string>
	tsCodegenFilepath: Signal<string | null>
	usages: Map<string, UsageRecord[]>
	engine: Signal<Engine | null>
	beginTransform: () => void
	endTransform: () => void
	triggerStyleUpdated: () => void
	moduleStates: Map<string, ModuleState>
	getEpoch: () => number
	scannedFilesWithUsages: Set<string>
	transformedFiles: Set<string>
}) {
	const fnConfig = createFnConfig(fnName)
	const registry = createDefaultProcessorRegistry()
	const commitDeps = { usages, triggerStyleUpdated }

	function dropModule(id: string) {
		const file = parseModuleId(id, cwd()).file
		moduleStates.delete(file)
		const hadUsages = usages.delete(file)
		if (hadUsages)
			triggerStyleUpdated()
	}

	async function transform(code: string, id: string) {
		const _engine = engine()
		if (_engine == null)
			return null

		const moduleId = parseModuleId(id, cwd())
		// Vue SFC sub-requests (`App.vue?vue&type=script`) carry content the
		// whole-SFC transform already rewrote; analyzing them again under
		// hard-error semantics would be a footgun.
		if (moduleId.query != null && moduleId.query.includes('vue&type='))
			return null

		// Source fast filter (extension + fn-name substring): decides only
		// whether to parse, never correctness. `fnName` is a prefix of every
		// variant root, so the substring check has no false negatives.
		if (!registry.has(moduleId.ext) || !code.includes(fnName)) {
			if (usages.has(moduleId.file)) {
				// The file previously contributed styles; regenerate outputs so
				// removed styles disappear from the codegen files.
				dropModule(moduleId.file)
			}
			return null
		}

		const sourceHash = hashSource(code)
		const cached = moduleStates.get(moduleId.file)
		if (cached?.prepared != null && cached.prepared.sourceHash === sourceHash) {
			// Prepared-cache hit (build double-pass, dev re-save): re-commit so
			// externally dropped usages are restored; regeneration triggers fire
			// only when the committed records actually differ.
			// Prepared results are only stored for modules with calls, so the
			// cached usage list is never empty here.
			commitModule(cached.prepared, commitDeps)
			transformedFiles.add(moduleId.file)
			return rewriteModule(code, cached.prepared)
		}

		beginTransform()
		try {
			log.debug(`Transforming file: ${id}`)

			let state = moduleStates.get(moduleId.file)
			if (state == null) {
				state = { revision: 0, prepared: null }
				moduleStates.set(moduleId.file, state)
			}
			// Guard against stale async completions: only the newest revision
			// (within the current engine epoch) may commit its results.
			const revision = ++state.revision
			const epoch = getEpoch()

			// Any analyze/prepare failure below propagates: module transforms
			// are atomic and a failing module hard-fails the build. The
			// module's previous usages stay intact (last-good).
			const analyzed = await analyzeModule(code, moduleId, { registry, fnConfig })
			if (analyzed == null || analyzed.calls.length === 0) {
				if (revision === state.revision && epoch === getEpoch()) {
					state.prepared = null
					if (usages.has(moduleId.file))
						dropModule(moduleId.file)
				}
				return null
			}

			const prepared = await prepareModule(analyzed, { engine: _engine, transformedFormat })
			if (revision === state.revision && epoch === getEpoch()) {
				state.prepared = prepared
				commitModule(prepared, commitDeps)
				transformedFiles.add(moduleId.file)
			}
			log.debug(`Transformed ${prepared.usageList.length} style usages in ${id}`)
			return rewriteModule(code, prepared)
		}
		finally {
			endTransform()
		}
	}

	async function fullScan(filePaths: string[]) {
		// Deterministic build order: canonical path order regardless of glob
		// stream order (task: byte-identical CSS across runs).
		const sorted = [...filePaths].sort()
		scannedFilesWithUsages.clear()
		transformedFiles.clear()

		// Mark the context busy so queued generated-file writes defer until the
		// whole scan committed (mirrors the per-transform bookkeeping).
		beginTransform()
		try {
			// Stage 1: read + analyze in bounded parallel batches (pure, engine-free).
			const analyzedList = Array.from<AnalyzedModule | null>({ length: sorted.length })
				.fill(null)
			const concurrency = 16
			for (let i = 0; i < sorted.length; i += concurrency) {
				await Promise.all(sorted.slice(i, i + concurrency)
					.map(async (filePath, offset) => {
						const code = await readFile(filePath, 'utf-8')
						analyzedList[i + offset] = await analyzeModule(code, parseModuleId(filePath, cwd()), { registry, fnConfig })
					}))
			}

			const _engine = engine()
			if (_engine == null)
				return

			// Stage 2: prepare + commit sequentially in sorted order so atomic
			// style ids are minted deterministically across files.
			for (const analyzed of analyzedList) {
				if (analyzed == null || analyzed.calls.length === 0)
					continue
				const prepared = await prepareModule(analyzed, { engine: _engine, transformedFormat })
				const state = moduleStates.get(analyzed.id) ?? { revision: 0, prepared: null }
				state.revision++
				state.prepared = prepared
				moduleStates.set(analyzed.id, state)
				commitModule(prepared, commitDeps)
				scannedFilesWithUsages.add(analyzed.id)
			}
		}
		finally {
			endTransform()
		}
	}

	return {
		// Declarative filter for bundlers. Bundler plugin adapters may read these
		// getters once at plugin conversion (before `cwd` is finalized) and
		// resolve relative patterns against `process.cwd()`, so the cwd-relative
		// excludes below are only a best effort — consumers must re-check ids at
		// transform time via `ctx.isTransformTarget()`.
		transformFilter: {
			get include() {
				return scan.include
			},
			get exclude() {
				return [
					...scan.exclude,
					// Internal live state (including the runtime CSS) must never
					// feed back into transforms; the directory-level exclude also
					// covers future internal files.
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
export function createCtx(options: IntegrationContextOptions): IntegrationContext {
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
	} = useConfig({
		...options,
		cwd,
		tsCodegenFilepath,
	})

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

	function queueTsCodegenUpdated() {
		pendingTsCodegenUpdated = true
		flushPendingUpdates()
	}

	const {
		transformFilter,
		transform,
		fullScan,
		dropModule,
	} = useTransform({
		...options,
		cwd,
		tsCodegenFilepath,
		usages,
		engine,
		beginTransform: () => {
			activeTransforms++
		},
		endTransform: () => {
			if (activeTransforms > 0)
				activeTransforms--
			flushPendingUpdates()
			notifyTransformsIdle()
		},
		triggerStyleUpdated: queueStyleUpdated,
		moduleStates,
		getEpoch: () => moduleEpoch,
		scannedFilesWithUsages,
		transformedFiles,
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
			await writeRuntimeCssFile(ctx.cssCodegenFilepath, content, join(cwd(), RUNTIME_STATE_DIRNAME, 'tmp'))
		},
		writeTsCodegenFile: async () => {
			await ctx.setupPromise
			if (ctx.tsCodegenFilepath == null)
				return

			const content = await ctx.getTsCodegenContent()
			if (content == null)
				return

			log.debug(`Writing TypeScript code generation file: ${ctx.tsCodegenFilepath}`)
			await writeGeneratedFile(ctx.tsCodegenFilepath, content)
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
			autocompleteConfigUpdated: queueTsCodegenUpdated,
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
				nextEngine = await createEngine(config, { onDiagnostic })
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
			nextEngine = await createEngine({ plugins: [devPlugin] }, { onDiagnostic })
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
		moduleStates.clear()
		scannedFilesWithUsages.clear()
		transformedFiles.clear()
		pendingStyleUpdated = false
		pendingTsCodegenUpdated = false
		hooks.styleUpdated.listeners.clear()
		hooks.tsCodegenUpdated.listeners.clear()
		engine(nextEngine)

		log.debug('Integration context setup successfully')
	}

	return ctx
}
