import type { EngineStore } from './atomic-style'
import type { AtomicStyleIdStrategy, CreateEngineOptions, Diagnostic, DiagnosticHandler, EngineHostContext } from './diagnostics'
import type { ExtractFn } from './extractor'
import type { PikaManager } from './pika'
import type { TypegenManager } from './typegen/registry'
import type { AtomicStyle, AutocompleteContribution, CSSStyleBlockBody, CSSStyleBlocks, EngineConfig, ExtractedStyleContent, InternalStyleDefinition, InternalStyleItem, Preflight, PreflightContext, PreflightDefinition, PreflightFn, ResolvedEngineConfig, ResolvedPreflight, StyleContent } from './types'
import { createEngineStore, getAtomicStyleBaseKey, optimizeAtomicStyleContents, resolveAtomicStyle } from './atomic-style'
import { cloneEngineConfig } from './config-clone'
import { ATOMIC_STYLE_ID_PLACEHOLDER, DEFAULT_ATOMIC_STYLE_ID_PREFIX, hasAtomicStyleIdPlaceholder, LAYER_SELECTOR_PREFIX, replaceAtomicStyleIdPlaceholder } from './constants'
import { emitDiagnostic, noopDiagnosticHandler } from './diagnostics'
import { createExtractFn, normalizeSelectors, normalizeValue } from './extractor'
import { createPikaManager, finalizePikaManager, getPikaStaticOwner } from './pika'
import { createEngineHooks, resolvePlugins } from './plugin'
import { important } from './plugins/important'
import { keyframes } from './plugins/keyframes'
import { selectors } from './plugins/selectors'
import { shortcuts } from './plugins/shortcuts'
import { variables } from './plugins/variables'
import { createTypegenManager, finalizeTypegenManager, validateTypegenPikaOwners } from './typegen/registry'
import {
	appendAutocomplete,
	isNotNullish,
	isPropertyValue,
	log,
	numberToChars,
	renderCSSStyleBlocks,
	toKebab,
} from './utils'

/**
 * Default CSS layer name for preflight styles.
 * @internal
 *
 * @remarks Used as the layer name wrapping all unlayered preflight output when the layer exists in `config.layers`.
 *
 * @example
 * ```ts
 * // 'preflights'
 * ```
 */
export const DEFAULT_PREFLIGHTS_LAYER = 'preflights'
/**
 * Default CSS layer name for utility (atomic) styles.
 * @internal
 *
 * @remarks Atomic styles without an explicit layer are placed into this layer when it exists in `config.layers`.
 *
 * @example
 * ```ts
 * // 'utilities'
 * ```
 */
export const DEFAULT_UTILITIES_LAYER = 'utilities'
/**
 * Default layer ordering map: `preflights` at weight 1, `utilities` at weight 10.
 * @internal
 *
 * @remarks Merged with any user-supplied `config.layers` during engine config resolution. Numeric weights determine the `@layer` declaration order.
 *
 * @example
 * ```ts
 * // { preflights: 1, utilities: 10 }
 * ```
 */
export const DEFAULT_LAYERS: Record<string, number> = { [DEFAULT_PREFLIGHTS_LAYER]: 1, [DEFAULT_UTILITIES_LAYER]: 10 }

export { getAtomicStyleId, optimizeAtomicStyleContents } from './atomic-style'

/** Finalized external dependency descriptor for one Engine. */
export type EngineConfigDependency
	= | Readonly<{ type: 'file', path: string }>
		| Readonly<{ type: 'directory-membership', path: string }>

interface EngineInitializationState {
	finalized: boolean
	dependencies: Map<string, EngineConfigDependency>
	finalizedDependencies?: readonly EngineConfigDependency[]
}

const engineInitializationStates = new WeakMap<Engine, EngineInitializationState>()

const defaultAtomicStyleIdStrategy: AtomicStyleIdStrategy = ({ index, prefix }) => `${prefix}${numberToChars(index)}`

function snapshotEngineHostContext(host: EngineHostContext | undefined): EngineHostContext {
	const snapshot: EngineHostContext = {}
	if (host?.projectRoot != null)
		Object.assign(snapshot, { projectRoot: host.projectRoot })
	if (host?.privateCssDiscriminator != null)
		Object.assign(snapshot, { privateCssDiscriminator: host.privateCssDiscriminator })
	return Object.freeze(snapshot)
}

function snapshotConfigDependencies(state: EngineInitializationState): readonly EngineConfigDependency[] {
	return Object.freeze([...state.dependencies.keys()]
		.sort()
		.map(key => Object.freeze({ ...state.dependencies.get(key)! })))
}

function finalizeEngineInitialization(engine: Engine): void {
	const state = engineInitializationStates.get(engine)!
	validateTypegenPikaOwners(engine.typegen, root => getPikaStaticOwner(engine.pika, root))
	finalizePikaManager(engine.pika)
	finalizeTypegenManager(engine.typegen)
	state.finalizedDependencies = snapshotConfigDependencies(state)
	state.finalized = true
}

/**
 * Creates and initializes a PikaCSS engine with the given configuration.
 *
 * @param config - The engine configuration, including plugins, selectors, shortcuts, variables, keyframes, preflights, and layer settings.
 * @param options - Runtime-only host capabilities, including the instance-scoped diagnostic handler.
 * @returns A fully initialized `Engine` instance.
 *
 * @remarks Core plugins (`important`, `variables`, `keyframes`, `selectors`, `shortcuts`) are prepended automatically. The function resolves plugins, runs all configuration hooks in sequence, and returns the ready-to-use engine.
 *
 * The caller-owned `config` graph is treated as immutable input (#117): the engine clones it into an engine-local working copy before any plugin configuration hook runs, so plugin hooks that mutate their config (`config.layers ??= {}` and friends) never write back into caller-owned objects, and the same config object can be reused across sequential or concurrent `createEngine()` calls without accumulating setup mutations. Ordinary config data (plain objects/arrays, `Map`/`Set` contents, `Date`, `RegExp`) is recursively isolated — module-augmented plugin fields included; functions and other opaque class instances keep their identity and are treated as immutable values; the `plugins` array is copied while plugin definition objects keep their identity (#116).
 *
 * @example
 * ```ts
 * const engine = await createEngine({ prefix: 'pk-', plugins: [myPlugin()] })
 * ```
 */
export async function createEngine(config: EngineConfig = {}, options: CreateEngineOptions = {}): Promise<Engine> {
	// The caller's config graph is immutable input (#117): everything from the
	// configure hooks through resolution mutates this engine-local working
	// copy only. Plugin definition identity is preserved (#116).
	config = cloneEngineConfig(config)
	const hostOnDiagnostic = options.onDiagnostic ?? noopDiagnosticHandler
	const onDiagnostic: DiagnosticHandler = diagnostic => emitDiagnostic(hostOnDiagnostic, diagnostic)
	const host = snapshotEngineHostContext(options.host)
	const atomicStyleIdStrategy = options.atomicStyleIdStrategy ?? defaultAtomicStyleIdStrategy
	const pluginHooks = createEngineHooks({ onDiagnostic, host })
	log.debug('Creating engine with config:', config)
	// `important()` must come after `shortcuts()` so that `!important` is applied
	// to shortcut-expanded definitions and never to the `__shortcut` reference itself.
	// Fresh factory calls on every createEngine(): the built-ins keep engine-local
	// data in their factory closures, which is safe ONLY because each engine gets
	// its own instances here and the factories are not exported as runtime values
	// (#116). Exporting them, or hoisting this array to module scope, would leak
	// state across engines — reusable definitions must use createState instead.
	const corePlugins = [
		variables(),
		keyframes(),
		selectors(),
		shortcuts(),
		important(),
	]
	log.debug('Core plugins loaded:', corePlugins.length)
	const plugins = resolvePlugins([...corePlugins, ...(config.plugins || [])])
	config = { ...config, plugins }
	log.debug(`Total plugins resolved: ${plugins.length}`)

	config = await pluginHooks.configureRawConfig(
		config.plugins!,
		config,
	)

	pluginHooks.rawConfigConfigured(
		resolvePlugins(config.plugins!),
		config,
	)

	let resolvedConfig = await resolveEngineConfig(config)
	log.debug('Engine config resolved with prefix:', resolvedConfig.prefix)

	resolvedConfig = await pluginHooks.configureResolvedConfig(
		resolvedConfig.plugins,
		resolvedConfig,
	)

	let engine = new Engine(resolvedConfig, hostOnDiagnostic, pluginHooks, atomicStyleIdStrategy)

	engine.appendAutocomplete({
		extraProperties: '__layer',
		properties: { __layer: 'Autocomplete[\'Layer\']' },
	})

	log.debug('Engine instance created')
	engine = await pluginHooks.configureEngine(
		engine.config.plugins,
		engine,
	)
	finalizeEngineInitialization(engine)
	log.debug('Engine initialized successfully')

	return engine
}

/**
 * The PikaCSS engine: manages atomic style resolution, rendering, preflights, and plugin hooks.
 *
 * @remarks Constructed via `createEngine()`. Holds the resolved configuration, the atomic style store, and exposes methods for processing style items (`use`), rendering CSS output (`renderPreflights`, `renderAtomicStyles`, `renderLayerOrderDeclaration`), and managing runtime extensions (`addPreflight`, `appendAutocomplete`, `appendCssImport`).
 *
 * @example
 * ```ts
 * const engine = await createEngine({ prefix: 'pk-' })
 * const ids = await engine.use({ color: 'red' })
 * const css = await engine.renderAtomicStyles(true)
 * ```
 */
export class Engine {
	/** The fully resolved engine configuration. */
	config: ResolvedEngineConfig
	/** Instance-scoped diagnostic handler supplied by the host. */
	readonly onDiagnostic: DiagnosticHandler
	/** Reference to the instance-scoped plugin hook dispatcher. */
	pluginHooks: ReturnType<typeof createEngineHooks>

	/** Finalized/read-side first-level Pika static authoring extension registry. */
	readonly pika: PikaManager
	/** Finalized/read-side Typegen semantic registry. */
	readonly typegen: TypegenManager

	/** The extraction function that decomposes style definitions into atomic style contents. */
	extract: ExtractFn

	/** The engine's runtime store holding registered atomic styles and their ID mappings. */
	store: EngineStore = createEngineStore()

	/** Finalized external file and directory-membership dependencies for this engine. */
	get configDependencies(): readonly EngineConfigDependency[] {
		const state = engineInitializationStates.get(this)!
		return state.finalizedDependencies ?? snapshotConfigDependencies(state)
	}

	/** Engine-owned atomic-style ID allocation strategy. */
	readonly #atomicStyleIdStrategy: AtomicStyleIdStrategy

	/**
	 * Creates an engine instance from a resolved configuration.
	 *
	 * @param config - The fully resolved engine configuration.
	 *
	 * @remarks Initializes the `extract` function by wiring it to the plugin hook pipeline for selectors, style items, and style definitions.
	 *
	 * @example
	 * ```ts
	 * const engine = new Engine(resolvedConfig)
	 * ```
	 */
	constructor(
		config: ResolvedEngineConfig,
		onDiagnostic: DiagnosticHandler = noopDiagnosticHandler,
		pluginHooks?: ReturnType<typeof createEngineHooks>,
		atomicStyleIdStrategy: AtomicStyleIdStrategy = defaultAtomicStyleIdStrategy,
	) {
		engineInitializationStates.set(this, { finalized: false, dependencies: new Map() })
		this.#atomicStyleIdStrategy = atomicStyleIdStrategy
		const safeOnDiagnostic: DiagnosticHandler = diagnostic => emitDiagnostic(onDiagnostic, diagnostic)
		this.config = config
		this.onDiagnostic = safeOnDiagnostic
		this.pluginHooks = pluginHooks ?? createEngineHooks({ onDiagnostic: safeOnDiagnostic })
		this.pika = createPikaManager()
		this.typegen = createTypegenManager()

		this.extract = createExtractFn({
			defaultSelector: this.config.defaultSelector,
			transformSelectors: selectors => this.pluginHooks.transformSelectors(this.config.plugins, selectors),
			transformStyleItems: styleItems => this.pluginHooks.transformStyleItems(this.config.plugins, styleItems),
			transformStyleDefinitions: styleDefinitions => this.pluginHooks.transformStyleDefinitions(this.config.plugins, styleDefinitions),
		})
	}

	/**
	 * Reports a structured diagnostic to this engine instance's host handler.
	 *
	 * @param diagnostic - The structured warning or error to deliver.
	 */
	reportDiagnostic(diagnostic: Diagnostic): void {
		emitDiagnostic(this.onDiagnostic, diagnostic)
	}

	/**
	 * Invokes a preflight function, memoizing the result in the given render-pass context.
	 *
	 * @param fn - The preflight function to invoke.
	 * @param isFormatted - Whether the preflight should produce formatted output.
	 * @param ctx - The render-pass context created by `renderPreflights`. When provided, each function executes at most once per pass and the context is forwarded to the preflight function.
	 * @returns A promise of the preflight result.
	 *
	 * @remarks Within one render pass each function executes at most once; concurrent callers (e.g. the variables pruning preflight scanning other preflights for `var()` usage) share the same promise. The memoization is scoped to `ctx`, so overlapping `renderPreflights` calls never interfere with each other. Without a context the function is invoked directly without caching — this is a deliberate change from the previous instance-scoped memoization, which could not tell overlapping passes apart. A preflight that inspects other preflights must therefore forward the `ctx` it receives (its third argument); calling with only `(fn, isFormatted)` from inside a pass runs `fn` again instead of reusing the pass result.
	 *
	 * @example
	 * ```ts
	 * const result = await engine.invokePreflight(preflight.fn, false, ctx)
	 * ```
	 */
	invokePreflight(fn: PreflightFn, isFormatted: boolean, ctx?: PreflightContext): Promise<string | PreflightDefinition> {
		if (ctx == null) {
			return Promise.resolve()
				.then(() => fn(this, isFormatted))
		}

		let invocation = ctx.invocations.get(fn)
		if (invocation == null) {
			invocation = Promise.resolve()
				.then(() => fn(this, isFormatted, ctx))
			ctx.invocations.set(fn, invocation)
		}
		return invocation
	}

	/**
	 * Registers a file dependency during Engine initialization.
	 *
	 * @param path - File path whose content/existence participates in Engine configuration semantics. Missing files are allowed.
	 * @throws If registration is attempted after Engine finalization.
	 */
	addConfigDependency(path: string): void {
		this.#registerConfigDependency('file', path)
	}

	/**
	 * Registers a direct directory-membership dependency during Engine initialization.
	 *
	 * @param path - Directory path whose direct member create/delete/rename events invalidate Engine configuration semantics.
	 * @throws If registration is attempted after Engine finalization.
	 */
	addConfigDirectoryMembershipDependency(path: string): void {
		this.#registerConfigDependency('directory-membership', path)
	}

	#registerConfigDependency(type: EngineConfigDependency['type'], path: string): void {
		const state = engineInitializationStates.get(this)
		if (state == null || state.finalized)
			throw new Error('Engine config dependencies are finalized and cannot be modified')
		const key = `${type === 'file' ? '0' : '1'}\0${path}`
		if (state.dependencies.has(key))
			return
		state.dependencies.set(key, { type, path } as EngineConfigDependency)
	}

	/**
	 * Fires the `preflightUpdated` hook to notify plugins that preflight content has changed.
	 *
	 *
	 * @remarks Called automatically after `addPreflight` or when plugins modify preflight-contributing state (e.g. variables, keyframes).
	 *
	 * @example
	 * ```ts
	 * engine.notifyPreflightUpdated()
	 * ```
	 */
	notifyPreflightUpdated() {
		this.pluginHooks.preflightUpdated(this.config.plugins)
	}

	/**
	 * Fires the `atomicStyleAdded` hook to notify plugins that a new atomic style was registered.
	 *
	 * @param atomicStyle - The atomic style that was just added to the store.
	 *
	 * @remarks Called automatically by `commitUse()` when a previously unseen atomic style is registered. This is a committed notification: the style's ID, cache keys, and store indices are already established, so mutating the payload is unsupported — plugins that need to transform styles must use the provisional hooks (`transformStyleItems`, `transformStyleDefinitions`, `transformSelectors`, `transformStyleContents`) instead (#114).
	 *
	 * @example
	 * ```ts
	 * engine.notifyAtomicStyleAdded(atomicStyle)
	 * ```
	 */
	notifyAtomicStyleAdded(atomicStyle: AtomicStyle) {
		this.pluginHooks.atomicStyleAdded(this.config.plugins, atomicStyle)
	}

	/**
	 * Fires the `autocompleteConfigUpdated` hook to notify plugins that autocomplete entries changed.
	 *
	 *
	 * @remarks Called automatically after `appendAutocomplete` when the contribution modifies the resolved autocomplete config.
	 *
	 * @example
	 * ```ts
	 * engine.notifyAutocompleteConfigUpdated()
	 * ```
	 */
	notifyAutocompleteConfigUpdated() {
		this.pluginHooks.autocompleteConfigUpdated(this.config.plugins)
	}

	/**
	 * Merges an autocomplete contribution into the resolved autocomplete config.
	 *
	 * @param contribution - The autocomplete entries to append (selectors, properties, CSS properties, etc.).
	 *
	 * @remarks Delegates to the `appendAutocomplete` utility and fires `autocompleteConfigUpdated` if the config was actually modified.
	 *
	 * @example
	 * ```ts
	 * engine.appendAutocomplete({ selectors: 'hover', cssProperties: { color: 'red' } })
	 * ```
	 */
	appendAutocomplete(contribution: AutocompleteContribution) {
		if (appendAutocomplete(this.config, contribution))
			this.notifyAutocompleteConfigUpdated()
	}

	/**
	 * Appends a CSS `@import` statement to the preflight output.
	 *
	 * @param cssImport - The raw `@import` string (a trailing semicolon is appended if missing).
	 *
	 * @remarks Deduplicates imports. Fires `preflightUpdated` when a new import is added.
	 *
	 * @example
	 * ```ts
	 * engine.appendCssImport('@import url("https://fonts.googleapis.com/css2?family=Inter")')
	 * ```
	 */
	appendCssImport(cssImport: string) {
		const normalized = normalizeCssImport(cssImport)
		if (normalized == null || this.config.cssImports.includes(normalized))
			return

		this.config.cssImports.push(normalized)
		this.notifyPreflightUpdated()
	}

	/**
	 * Registers a new preflight that will be rendered before atomic styles.
	 *
	 * @param preflight - A preflight definition: a function, a static string/object, or a wrapper with `layer`/`id` metadata.
	 *
	 * @remarks The preflight is resolved into a `ResolvedPreflight` (extracting optional `layer` and `id`) and appended to `config.preflights`. Fires `preflightUpdated` so plugins and the integration layer know to re-render.
	 *
	 * @example
	 * ```ts
	 * engine.addPreflight({ layer: 'base', preflight: '*, *::before { box-sizing: border-box; }' })
	 * ```
	 */
	addPreflight(preflight: Preflight) {
		log.debug('Adding preflight')
		this.config.preflights.push(resolvePreflight(preflight))
		log.debug(`Total preflights: ${this.config.preflights.length}`)
		this.notifyPreflightUpdated()
	}

	/**
	 * Provisionally resolves style items into a commit-ready plan without touching committed engine state.
	 *
	 * @param itemList - Style items to process: string references (shortcuts) and/or style definition objects.
	 * @returns A promise of the {@link StyleUsePlan} to pass to `commitUse()`.
	 *
	 * @remarks
	 * Runs the full provisional pipeline: `transformStyleItems`, extraction
	 * (`transformStyleDefinitions`/`transformSelectors`), normalization, and the
	 * normalized-content seam `transformStyleContents`. It allocates no atomic
	 * style IDs, mutates no `EngineStore` state, and fires no committed
	 * notifications — a rejection anywhere leaves the engine exactly as it was.
	 * Plans deliberately carry no IDs: reuse-vs-fresh decisions read live store
	 * state and are only valid inside `commitUse()` (#114).
	 *
	 * @example
	 * ```ts
	 * const plan = await engine.prepareUse({ color: 'red' })
	 * const ids = engine.commitUse(plan)
	 * ```
	 */
	async prepareUse(...itemList: InternalStyleItem[]): Promise<StyleUsePlan> {
		log.debug(`Preparing ${itemList.length} style items`)
		const {
			unknown,
			contents,
		} = await resolveStyleItemList({
			itemList,
			transformStyleItems: styleItems => this.pluginHooks.transformStyleItems(this.config.plugins, styleItems),
			extractStyleDefinition: styleDefinition => this.extract(styleDefinition),
		})
		// Normalized-content seam (#114): plugins may rewrite/expand normalized
		// contents (1→1 or 1→N) before any ID exists. Re-optimizing afterwards
		// re-deduplicates and recomputes `orderSensitiveTo` for hook output; the
		// pass is idempotent when no plugin changed anything.
		const transformed = await this.pluginHooks.transformStyleContents(this.config.plugins, contents)
		return { unknown, contents: optimizeAtomicStyleContents(transformed) }
	}

	/**
	 * Commits a prepared plan: allocates/reuses atomic style IDs and registers new styles in the store.
	 *
	 * @param plan - A plan produced by `prepareUse()`.
	 * @returns An array containing any unresolved string references first, followed by atomic style IDs in resolution order.
	 *
	 * @remarks
	 * This is the short, mutation-critical section and MUST stay synchronous:
	 * integration layers commit whole modules inside a revision/epoch-checked
	 * synchronous block, so an `await` here would reopen the stale-commit race
	 * (#114). `atomicStyleAdded` fires per newly registered style as a committed
	 * notification; a throwing observer is reported through the diagnostic
	 * context but never rolls back the already-committed registration.
	 *
	 * @example
	 * ```ts
	 * const ids = engine.commitUse(await engine.prepareUse({ color: 'red' }))
	 * ```
	 */
	commitUse(plan: StyleUsePlan): string[] {
		const resolvedIds: string[] = []
		const resolvedIdsByBaseKey = new Map<string, string>()
		for (const content of plan.contents) {
			const { id, atomicStyle } = resolveAtomicStyle({
				content,
				prefix: this.config.prefix,
				store: this.store,
				resolvedIdsByBaseKey,
				atomicStyleIdStrategy: this.#atomicStyleIdStrategy,
			})
			resolvedIds.push(id)
			resolvedIdsByBaseKey.set(getAtomicStyleBaseKey(content), id)
			if (atomicStyle != null) {
				log.debug(`Atomic style added: ${id}`)
				try {
					this.notifyAtomicStyleAdded(atomicStyle)
				}
				catch {
					// Committed-notification contract (#114): the style is already
					// registered; the hook dispatcher reported the failure via the
					// diagnostic context, and observers cannot veto a commit.
				}
			}
		}
		log.debug(`Resolved ${resolvedIds.length} atomic styles, ${plan.unknown.size} unknown items`)
		return [...plan.unknown, ...resolvedIds]
	}

	/**
	 * Processes style items through the plugin pipeline and registers the resulting atomic styles in the store.
	 *
	 * @param itemList - Style items to process: string references (shortcuts) and/or style definition objects.
	 * @returns An array containing any unresolved string references first, followed by atomic style IDs in resolution order.
	 *
	 * @remarks Equivalent to `commitUse(await prepareUse(...itemList))` — the convenience path for direct consumers. Integration layers that need whole-module transactionality call the two phases separately (#114).
	 *
	 * @example
	 * ```ts
	 * const ids = await engine.use({ color: 'red' }, { padding: '1rem' })
	 * ```
	 */
	async use(...itemList: InternalStyleItem[]): Promise<string[]> {
		return this.commitUse(await this.prepareUse(...itemList))
	}

	/**
	 * Renders all registered preflight definitions into a CSS string.
	 *
	 * @param isFormatted - Whether to produce human-readable CSS with newlines and indentation.
	 * @param options - Optional render-pass options.
	 * @param options.usedAtomicStyleIds - Atomic style IDs considered "in use" for this pass. When provided, pruning preflights (variables, keyframes) only consider these atomic styles instead of the whole append-only store; when omitted, all stored atomic styles are considered.
	 * @returns The rendered preflight CSS, including `@import` statements, optional `@layer` wrappers, and all preflight content.
	 *
	 * @remarks Evaluates each preflight function, groups output by layer, wraps unlayered preflights in the default preflights layer (when present), and respects configured layer ordering. Each call creates its own `PreflightContext`, so within one pass each preflight function executes exactly once even when passes overlap.
	 *
	 * @example
	 * ```ts
	 * const css = await engine.renderPreflights(true)
	 * const scoped = await engine.renderPreflights(true, { usedAtomicStyleIds: ['pk-a'] })
	 * ```
	 */
	async renderPreflights(isFormatted: boolean, options: { usedAtomicStyleIds?: Iterable<string> } = {}) {
		log.debug('Rendering preflights...')
		const lineEnd = isFormatted ? '\n' : ''

		const ctx: PreflightContext = {
			invocations: new Map(),
			usedAtomicStyleIds: options.usedAtomicStyleIds == null
				? undefined
				: new Set(options.usedAtomicStyleIds),
		}
		const rendered = (await Promise.all(
			this.config.preflights.map(async ({ layer, fn }) => {
				const result = await this.invokePreflight(fn, isFormatted, ctx)
				const css = (
					typeof result === 'string'
						? result
						: await renderPreflightDefinition({ engine: this, preflightDefinition: result, isFormatted })
				).trim()
				return { layer, css }
			}),
		)).filter(r => r.css)
		log.debug(`Rendered ${rendered.length} preflights`)

		const { unlayeredParts, layerGroups } = groupRenderedPreflightsByLayer(rendered)

		const outputParts: string[] = []
		if (this.config.cssImports.length > 0)
			outputParts.push(...this.config.cssImports)
		if (unlayeredParts.length > 0) {
			const { defaultPreflightsLayer } = this.config
			// Unlayered preflights are automatically wrapped inside the defaultPreflightsLayer
			// when that layer name exists in the configured layers.
			if (defaultPreflightsLayer in this.config.layers) {
				const unlayeredContent = unlayeredParts
					.map(
						part => part.trim()
							.split('\n')
							.map(line => `  ${line}`)
							.join(lineEnd),
					)
					.join(lineEnd)
				outputParts.push(`@layer ${defaultPreflightsLayer} {${lineEnd}${unlayeredContent}${lineEnd}}`)
			}
			else {
				const unlayeredContent = unlayeredParts.join(lineEnd)
				outputParts.push(unlayeredContent)
			}
		}
		outputParts.push(...renderLayerBlocks({
			layerGroups,
			layerOrder: sortLayerNames(this.config.layers),
			isFormatted,
			render: cssList => cssList.join(lineEnd),
		}))
		return outputParts.join(lineEnd)
	}

	/**
	 * Renders atomic styles into a CSS string, optionally filtered by ID and grouped by layer.
	 *
	 * @param isFormatted - Whether to produce human-readable CSS with newlines and indentation.
	 * @param options - Optional filtering: `atomicStyleIds` to render a subset.
	 * @param options.atomicStyleIds - Specific atomic style IDs to render instead of the full store.
	 * @returns The rendered atomic-style CSS.
	 *
	 * @remarks Styles are sorted by rendering weight (selector specificity depth), grouped into configured `@layer` blocks, and rendered.
	 *
	 * @example
	 * ```ts
	 * const css = await engine.renderAtomicStyles(true)
	 * ```
	 */
	async renderAtomicStyles(isFormatted: boolean, options: { atomicStyleIds?: string[] } = {}) {
		log.debug('Rendering atomic styles...')
		const { atomicStyleIds = null } = options

		const atomicStyles = atomicStyleIds == null
			? [...this.store.atomicStyles.values()]
			: atomicStyleIds.map(id => this.store.atomicStyles.get(id))
					.filter(isNotNullish)
		log.debug(`Rendering ${atomicStyles.length} atomic styles`)
		reportUnknownAtomicStyleLayers(this, atomicStyles)
		return renderAtomicStyles({
			atomicStyles,
			isFormatted,
			defaultSelector: this.config.defaultSelector,
			layers: this.config.layers,
			defaultUtilitiesLayer: this.config.defaultUtilitiesLayer,
		})
	}

	/**
	 * Renders the CSS `@layer` order declaration for all configured layers.
	 *
	 * @returns A `@layer` statement listing layer names in weight order, or an empty string if no layers are configured.
	 *
	 * @remarks Ensures the browser applies the intended cascade priority for `preflights`, `utilities`, and any user-defined layers.
	 *
	 * @example
	 * ```ts
	 * engine.renderLayerOrderDeclaration()
	 * // '@layer preflights, utilities;'
	 * ```
	 */
	renderLayerOrderDeclaration(): string {
		const { layers } = this.config
		if (Object.keys(layers).length === 0)
			return ''
		return `@layer ${sortLayerNames(layers)
			.join(', ')};`
	}
}

/**
 * Computes a numeric rendering weight for an atomic style based on its selector depth.
 * @internal
 *
 * @param style - The atomic style to weigh.
 * @param defaultSelector - The engine's default selector pattern.
 * @returns `0` for styles using only the default selector; otherwise the number of selector segments.
 *
 * @remarks Used to sort atomic styles so that simpler selectors appear before more specific ones in the CSS output, preserving deterministic cascade ordering.
 *
 * @example
 * ```ts
 * calcAtomicStyleRenderingWeight(style, '.pk-__PLACEHOLDER__')
 * ```
 */
export function calcAtomicStyleRenderingWeight(style: AtomicStyle, defaultSelector: string) {
	const { selector } = splitLayerSelector(style.content.selector)
	const isDefaultSelector = selector.length === 1 && selector[0]! === defaultSelector
	return isDefaultSelector ? 0 : selector.length
}

/**
 * Sorts layer names by their numeric weight, then alphabetically for ties.
 *
 * @param layers - A record mapping layer names to numeric weights.
 * @returns An array of layer names in ascending weight order.
 *
 * @remarks Used to produce the `@layer` declaration order and to order layer group rendering.
 *
 * @example
 * ```ts
 * sortLayerNames({ utilities: 10, preflights: 1 })
 * // ['preflights', 'utilities']
 * ```
 */
export function sortLayerNames(layers: Record<string, number>): string[] {
	return Object.entries(layers)
		.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
		.map(([name]) => name)
}

function appendLayerGroupItem<T>(layerGroups: Map<string, T[]>, layer: string, item: T) {
	if (!layerGroups.has(layer))
		layerGroups.set(layer, [])
	layerGroups.get(layer)!.push(item)
}

function getOrderedLayerNamesForGroups<T>(layerGroups: Map<string, T[]>, layerOrder: string[]) {
	return [
		...layerOrder.filter(name => (layerGroups.get(name)?.length ?? 0) > 0),
		...[...layerGroups.keys()].filter(name => !layerOrder.includes(name) && layerGroups.get(name)!.length > 0),
	]
}

function renderLayerBlocks<T>({
	layerGroups,
	layerOrder,
	isFormatted,
	render,
}: {
	layerGroups: Map<string, T[]>
	layerOrder: string[]
	isFormatted: boolean
	render: (items: T[]) => string
}) {
	const lineEnd = isFormatted ? '\n' : ''
	return getOrderedLayerNamesForGroups(layerGroups, layerOrder)
		.map((layerName) => {
			const items = layerGroups.get(layerName)!
			const content = isFormatted
				? render(items)
						.trim()
						.split('\n')
						.map(line => `  ${line}`)
						.join('\n')
				: render(items)
			return `@layer ${layerName} {${lineEnd}${content}${lineEnd}}`
		})
}

function normalizeCssImport(cssImport: string) {
	const normalized = cssImport.trim()
	if (normalized.length === 0)
		return null
	return normalized.endsWith(';') ? normalized : `${normalized};`
}

function groupRenderedPreflightsByLayer(rendered: { layer?: string, css: string }[]) {
	const unlayeredParts: string[] = []
	const layerGroups = new Map<string, string[]>()
	for (const { layer, css } of rendered) {
		if (layer == null) {
			unlayeredParts.push(css)
			continue
		}
		appendLayerGroupItem(layerGroups, layer, css)
	}
	return { unlayeredParts, layerGroups }
}

function splitLayerSelector(selector: string[]) {
	const [first, ...rest] = selector
	if (first == null || first.startsWith(LAYER_SELECTOR_PREFIX) === false)
		return { layer: undefined, selector }

	const layer = first.slice(LAYER_SELECTOR_PREFIX.length)
		.trim()
	if (layer.length === 0)
		return { layer: undefined, selector }

	return {
		layer,
		selector: rest,
	}
}

function prependLayerSelector(selector: string[], layer: string) {
	return [`${LAYER_SELECTOR_PREFIX}${layer}`, ...selector]
}

function reportUnknownAtomicStyleLayers(engine: Engine, styles: AtomicStyle[]) {
	const knownLayers = new Set(Object.keys(engine.config.layers))
	const reportedLayers = new Set<string>()
	for (const style of styles) {
		const { layer } = splitLayerSelector(style.content.selector)
		if (layer == null || knownLayers.has(layer) || reportedLayers.has(layer))
			continue
		reportedLayers.add(layer)
		engine.reportDiagnostic({
			level: 'warning',
			code: 'atomic-style-unknown-layer',
			message: `Unknown layer "${layer}" encountered in atomic style; falling back to unlayered output.`,
		})
	}
}

function groupAtomicStylesByLayer({
	styles,
	layerOrder,
	defaultUtilitiesLayer,
}: {
	styles: AtomicStyle[]
	layerOrder: string[]
	defaultUtilitiesLayer?: string
}) {
	const unlayeredStyles: AtomicStyle[] = []
	const layerGroups = new Map<string, AtomicStyle[]>(layerOrder.map(name => [name, []]))
	const candidateDefaultLayer = defaultUtilitiesLayer ?? layerOrder.at(-1)
	const defaultLayer = (candidateDefaultLayer != null && layerGroups.has(candidateDefaultLayer))
		? candidateDefaultLayer
		: layerOrder.at(-1)

	for (const style of styles) {
		const { layer } = splitLayerSelector(style.content.selector)
		if (layer != null && layerGroups.has(layer)) {
			layerGroups.get(layer)!.push(style)
			continue
		}
		if (layer != null) {
			unlayeredStyles.push(style)
			continue
		}
		if (defaultLayer != null) {
			layerGroups.get(defaultLayer)!.push(style)
			continue
		}
		unlayeredStyles.push(style)
	}

	return { unlayeredStyles, layerGroups }
}

function hasPreflightWrapper<K extends 'layer' | 'id'>(p: unknown, key: K): p is Record<K, string> & { preflight: unknown } {
	if (typeof p !== 'object' || p === null)
		return false
	const record = p as Record<string, unknown>
	return typeof record[key] === 'string' && record.preflight !== undefined
}

/**
 * Normalizes a `Preflight` input into a `ResolvedPreflight` by extracting optional `layer` and `id` wrappers.
 * @internal
 *
 * @param preflight - A preflight value: a function, a static string/`PreflightDefinition`, or a wrapper with `layer`/`id` metadata.
 * @returns A `ResolvedPreflight` with separated `layer`, `id`, and `fn`.
 *
 * @remarks Handles nested wrappers: a `{ layer, preflight: { id, preflight: fn } }` shape is unwrapped in order.
 *
 * @example
 * ```ts
 * resolvePreflight({ layer: 'base', id: 'reset', preflight: '* { margin: 0 }' })
 * ```
 */
export function resolvePreflight(preflight: Preflight): ResolvedPreflight {
	let layer: string | undefined
	let id: string | undefined

	// Peel off WithLayer wrapper
	if (hasPreflightWrapper(preflight, 'layer')) {
		layer = preflight.layer
		preflight = preflight.preflight as Preflight
	}

	// Peel off WithId wrapper
	if (hasPreflightWrapper(preflight, 'id')) {
		id = preflight.id
		preflight = preflight.preflight as Preflight
	}

	const fn: PreflightFn = typeof preflight === 'function' ? preflight : () => preflight as string | PreflightDefinition
	return { layer, id, fn }
}

/**
 * Resolves a raw `EngineConfig` into a fully normalized `ResolvedEngineConfig`.
 * @internal
 *
 * @param config - The raw engine configuration.
 * @returns A `ResolvedEngineConfig` with defaults applied, plugins sorted, preflights resolved, and autocomplete initialized.
 *
 * @remarks Merges `DEFAULT_LAYERS`, normalizes CSS imports, resolves preflight definitions, and initializes the empty autocomplete sets/maps.
 *
 * @example
 * ```ts
 * const resolved = await resolveEngineConfig({ prefix: 'pk-' })
 * ```
 */
export async function resolveEngineConfig(config: EngineConfig): Promise<ResolvedEngineConfig> {
	const {
		prefix = DEFAULT_ATOMIC_STYLE_ID_PREFIX,
		defaultSelector = `.${ATOMIC_STYLE_ID_PLACEHOLDER}`,
		plugins = [],
		cssImports = [],
		preflights = [],
	} = config
	const layers: Record<string, number> = Object.assign({}, DEFAULT_LAYERS, config.layers)
	const defaultPreflightsLayer = config.defaultPreflightsLayer ?? DEFAULT_PREFLIGHTS_LAYER
	const defaultUtilitiesLayer = config.defaultUtilitiesLayer ?? DEFAULT_UTILITIES_LAYER
	log.debug(`Resolving engine config with prefix: "${prefix}", plugins: ${plugins.length}, preflights: ${preflights.length}`)

	const resolvedConfig: ResolvedEngineConfig = {
		rawConfig: config,
		plugins: resolvePlugins(plugins),
		prefix,
		defaultSelector,
		preflights: [],
		cssImports: [...new Set(
			cssImports.map(normalizeCssImport)
				.filter(isNotNullish),
		)],
		layers,
		defaultPreflightsLayer,
		defaultUtilitiesLayer,
		autocomplete: {
			selectors: new Set(),
			shortcuts: new Set(),
			extraProperties: new Set(),
			extraCssProperties: new Set(),
			properties: new Map(),
			cssProperties: new Map(),
			patterns: {
				selectors: new Set(),
				shortcuts: new Set(),
				properties: new Map(),
				cssProperties: new Map(),
			},
		},
	}

	appendAutocomplete(resolvedConfig, config.autocomplete ?? {})

	// process preflights
	const resolvedPreflights = preflights.map(resolvePreflight)
	resolvedConfig.preflights.push(...resolvedPreflights)
	log.debug(`Engine config resolved: ${resolvedPreflights.length} preflights processed`)

	return resolvedConfig
}

/**
 * The provisional result of `engine.prepareUse()`: fully transformed, extracted,
 * and normalized style contents plus unresolved string references, ready to be
 * committed via `engine.commitUse()`.
 *
 * @remarks
 * A plan deliberately carries no atomic style IDs and no base-key resolutions:
 * reuse-vs-fresh-ID decisions read live `EngineStore` state and are only valid
 * at the moment `commitUse()` runs. Discarding an uncommitted plan has no
 * effect on the engine (#114).
 */
export interface StyleUsePlan {
	/** String references no plugin resolved; echoed back verbatim by `commitUse()`. */
	unknown: Set<string>
	/** Deduplicated, normalized style contents in resolution order. */
	contents: StyleContent[]
}

function extractLayerFromStyleItem(item: InternalStyleDefinition): { layer: string | undefined, definition: InternalStyleDefinition } {
	const record = item as Record<string, unknown>
	const layer = typeof record.__layer === 'string' ? record.__layer : undefined
	if (layer == null) {
		return { layer: undefined, definition: item }
	}
	const { __layer: _, ...rest } = record
	return { layer, definition: rest as InternalStyleDefinition }
}

/**
 * Transforms and extracts a list of style items into deduplicated atomic style contents.
 * @internal
 *
 * @param options - An object containing:
 *   - `itemList` — the raw style items to process.
 *   - `transformStyleItems` — the plugin hook for transforming style items.
 *   - `extractStyleDefinition` — the function that decomposes a style definition into extracted contents.
 * @param options.itemList - The raw style items to process.
 * @param options.transformStyleItems - Hook that expands or rewrites style items before extraction.
 * @param options.extractStyleDefinition - Function that decomposes a style definition into extracted style contents.
 * @returns An object with `unknown` (unresolved string references) and `contents` (optimized extracted style contents).
 *
 * @remarks String items that survive the `transformStyleItems` hook are collected into the `unknown` set. Object items are extracted, optionally layer-prepended, and optimized for duplicate property merging.
 *
 * @example
 * ```ts
 * const { unknown, contents } = await resolveStyleItemList({ itemList, transformStyleItems, extractStyleDefinition })
 * ```
 */
export async function resolveStyleItemList({
	itemList,
	transformStyleItems,
	extractStyleDefinition,
}: {
	itemList: InternalStyleItem[]
	transformStyleItems: (styleItems: InternalStyleItem[]) => Promise<InternalStyleItem[]>
	extractStyleDefinition: (styleObj: InternalStyleDefinition) => Promise<ExtractedStyleContent[]>
}) {
	const unknown = new Set<string>()
	const list: ExtractedStyleContent[] = []
	for (const styleItem of await transformStyleItems(itemList)) {
		if (typeof styleItem === 'string') {
			unknown.add(styleItem)
		}
		else {
			const { layer, definition } = extractLayerFromStyleItem(styleItem)
			const extracted = await extractStyleDefinition(definition)
			list.push(...(layer == null
				? extracted
				: extracted.map(content => ({
						...content,
						selector: prependLayerSelector(content.selector, layer),
					}))))
		}
	}
	return {
		unknown,
		contents: optimizeAtomicStyleContents(list),
	}
}

function sortAtomicStyles(styles: AtomicStyle[], defaultSelector: string): AtomicStyle[] {
	return [...styles].sort(
		(a, b) => calcAtomicStyleRenderingWeight(a, defaultSelector) - calcAtomicStyleRenderingWeight(b, defaultSelector),
	)
}

function renderAtomicStylesCss({ atomicStyles, isFormatted }: {
	atomicStyles: AtomicStyle[]
	isFormatted: boolean
}): string {
	const blocks: CSSStyleBlocks = new Map()
	atomicStyles
		.forEach(({ id, content: { selector: rawSelector, property, value } }) => {
			const { selector } = splitLayerSelector(rawSelector)
			const isValidSelector = selector.some(s => hasAtomicStyleIdPlaceholder(s))
			if (isValidSelector === false || value == null)
				return

			const renderObject = {
				selector: selector.map(s => replaceAtomicStyleIdPlaceholder(s, id)),
				properties: value.map(v => ({ property, value: v })),
			}

			let currentBlocks = blocks
			for (let i = 0; i < renderObject.selector.length; i++) {
				const s = renderObject.selector[i]!
				const blockBody = currentBlocks.get(s) || { properties: [] }

				const isLastSelector = i === renderObject.selector.length - 1
				if (isLastSelector)
					blockBody.properties.push(...renderObject.properties)
				else
					blockBody.children ||= new Map()

				currentBlocks.set(s, blockBody)

				if (isLastSelector === false)
					currentBlocks = blockBody.children!
			}
		})
	return renderCSSStyleBlocks(blocks, isFormatted)
}

/**
 * Standalone function that renders atomic styles into CSS with layer grouping.
 * @internal
 *
 * @param payload - An object containing `atomicStyles`, `isFormatted`, `defaultSelector`, and optional `layers`/`defaultUtilitiesLayer`.
 * @param payload.atomicStyles - The atomic styles to render.
 * @param payload.isFormatted - Whether to render with indentation and line breaks.
 * @param payload.defaultSelector - The engine default selector used when computing render order.
 * @param payload.layers - Optional configured CSS layers to group atomic styles into.
 * @param payload.defaultUtilitiesLayer - Optional fallback layer for unlayered utility styles.
 * @returns The rendered CSS string.
 *
 * @remarks Sorts styles by rendering weight, groups them into `@layer` blocks when layers are configured, and renders each group. Used by both the `Engine.renderAtomicStyles` method and external consumers.
 *
 * @example
 * ```ts
 * const css = renderAtomicStyles({ atomicStyles, isFormatted: true, defaultSelector: '.pk-__ID__', layers: { utilities: 10 } })
 * ```
 */
export function renderAtomicStyles(payload: { atomicStyles: AtomicStyle[], isFormatted: boolean, defaultSelector: string, layers?: Record<string, number>, defaultUtilitiesLayer?: string }): string {
	const { atomicStyles, isFormatted, defaultSelector, layers, defaultUtilitiesLayer } = payload

	// Sort once up-front so each sub-render receives styles in correct order.
	const sortedStyles = sortAtomicStyles(atomicStyles, defaultSelector)

	if (layers == null) {
		return renderAtomicStylesCss({ atomicStyles: sortedStyles, isFormatted })
	}

	const layerOrder = sortLayerNames(layers)
	const lineEnd = isFormatted ? '\n' : ''
	const { unlayeredStyles, layerGroups } = groupAtomicStylesByLayer({
		styles: sortedStyles,
		layerOrder,
		defaultUtilitiesLayer,
	})

	const parts: string[] = []

	if (unlayeredStyles.length > 0)
		parts.push(renderAtomicStylesCss({ atomicStyles: unlayeredStyles, isFormatted }))

	parts.push(...renderLayerBlocks({
		layerGroups,
		layerOrder,
		isFormatted,
		render: styles => renderAtomicStylesCss({ atomicStyles: styles, isFormatted }),
	}))

	return parts.join(lineEnd)
}

/**
 * Recursively converts a `PreflightDefinition` object tree into CSS style blocks.
 * @internal
 *
 * @param options - An object containing:
 *   - `engine` — the engine instance (used for selector transformation).
 *   - `preflightDefinition` — the nested object tree of selectors and CSS properties.
 *   - `blocks` — accumulator map for the resulting CSS blocks.
 * @param options.engine - The engine instance used to run selector transforms.
 * @param options.preflightDefinition - The nested preflight definition object to convert into CSS blocks.
 * @param options.blocks - Optional accumulator map reused during recursive descent.
 * @returns The accumulated `CSSStyleBlocks` map.
 *
 * @remarks Each key in the definition is either a CSS property (when its value is a property value) or a nested selector scope (when its value is an object). Selector keys are expanded through the engine-local `pluginHooks.transformSelectors` dispatcher. The resulting blocks map is consumable by `renderCSSStyleBlocks`.
 *
 * @example
 * ```ts
 * const blocks = await _renderPreflightDefinition({ engine, preflightDefinition: { ':root': { '--color': 'red' } } })
 * ```
 */
export async function _renderPreflightDefinition({
	engine,
	preflightDefinition,
	blocks = new Map(),
}: {
	engine: Engine
	preflightDefinition: PreflightDefinition
	blocks?: CSSStyleBlocks
}) {
	for (const [selector, propertiesOrDefinition] of Object.entries(preflightDefinition)) {
		if (propertiesOrDefinition == null)
			continue

		const selectors = normalizeSelectors({
			selectors: await engine.pluginHooks.transformSelectors(engine.config.plugins, [selector]),
			defaultSelector: '',
		})
			.filter(Boolean)
		if (selectors.length === 0)
			continue
		let currentBlocks = blocks
		let currentBlockBody: CSSStyleBlockBody = null!
		selectors.forEach((s, i) => {
			const isLast = i === selectors.length - 1
			currentBlocks.set(s, currentBlocks.get(s) || { properties: [] })
			if (isLast) {
				currentBlockBody = currentBlocks.get(s)!
				return
			}
			currentBlocks = currentBlocks.get(s)!.children ||= new Map()
		})

		for (const [k, v] of Object.entries(propertiesOrDefinition)) {
			if (isPropertyValue(v)) {
				const property = toKebab(k)
				const normalizedValue = normalizeValue(v)
				if (normalizedValue != null) {
					normalizedValue.forEach(value => currentBlockBody.properties.push({ property, value }))
				}
			}
			else {
				currentBlockBody.children ||= new Map()
				currentBlockBody.children.set(k, currentBlockBody.children.get(k) || { properties: [] })
				await _renderPreflightDefinition({
					engine,
					preflightDefinition: { [k]: v } as PreflightDefinition,
					blocks: currentBlockBody.children,
				})
			}
		}
	}
	return blocks
}

/**
 * Renders a `PreflightDefinition` into a CSS string via the engine's selector pipeline.
 * @internal
 *
 * @param payload - An object with the `engine`, the `preflightDefinition` to render, and `isFormatted` flag.
 * @param payload.engine - The engine instance whose selector pipeline should be applied.
 * @param payload.preflightDefinition - The preflight definition tree to render.
 * @param payload.isFormatted - Whether the rendered CSS should include indentation and line breaks.
 * @returns The rendered CSS string.
 *
 * @remarks A convenience wrapper that calls `_renderPreflightDefinition` and pipes the result through `renderCSSStyleBlocks`.
 *
 * @example
 * ```ts
 * const css = await renderPreflightDefinition({ engine, preflightDefinition: { ':root': { color: 'red' } }, isFormatted: true })
 * ```
 */
export async function renderPreflightDefinition(payload: {
	engine: Engine
	preflightDefinition: PreflightDefinition
	isFormatted: boolean
}): Promise<string> {
	const { engine, preflightDefinition, isFormatted } = payload
	const blocks = await _renderPreflightDefinition({
		engine,
		preflightDefinition,
	})
	return renderCSSStyleBlocks(blocks, isFormatted)
}
