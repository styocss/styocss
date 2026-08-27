import type { EnginePluginContext } from './diagnostics'
import type { Engine } from './engine'
import type { PikaRegistrationCapability } from './pika'
import type { TypegenRegistrationCapability } from './typegen/registry'
import type { AtomicStyle, Awaitable, EngineConfig, ResolvedEngineConfig, ResolvedStyleDefinition, ResolvedStyleItem, StyleContent } from './types'
import { emitDiagnostic, noopDiagnosticHandler } from './diagnostics'
import { createPikaRegistrationController } from './pika'
import { createTypegenRegistrationController } from './typegen/registry'
import { log } from './utils'

type DefineHooks<Hooks extends Record<string, [type: 'sync' | 'async', payload: unknown, returnValue?: unknown]>> = Hooks

type EngineHooksDefinition = DefineHooks<{
	configureRawConfig: ['async', config: EngineConfig]
	rawConfigConfigured: ['sync', config: EngineConfig, void]
	configureResolvedConfig: ['async', resolvedConfig: ResolvedEngineConfig]
	configureEngine: ['async', engine: Engine]
	transformSelectors: ['async', selectors: string[]]
	transformStyleItems: ['async', styleItems: ResolvedStyleItem[]]
	transformStyleDefinitions: ['async', styleDefinitions: ResolvedStyleDefinition[]]
	// Normalized-content seam (#114): runs during the provisional phase, after
	// extraction/normalization but before any atomic style ID exists. Safe for
	// 1→1 and 1→N rewrites; a rejection aborts preparation with zero committed
	// engine state.
	transformStyleContents: ['async', styleContents: StyleContent[]]
	preflightUpdated: ['sync', void]
	// Committed notification (#114): the style is already registered in the
	// store when this fires. Mutating the payload is unsupported — its ID,
	// cache keys, and store indices are established. Transform via the
	// provisional hooks above instead.
	atomicStyleAdded: ['sync', AtomicStyle]
}>

type GetHooksNames<
	T extends 'sync' | 'async',
	K extends keyof EngineHooksDefinition = keyof EngineHooksDefinition,
> = K extends keyof EngineHooksDefinition ? EngineHooksDefinition[K][0] extends T ? K : never : never

type SyncHooksNames = GetHooksNames<'sync'>
type AsyncHooksNames = GetHooksNames<'async'>
type EngineHookName = keyof EngineHooksDefinition

/**
 * Owner-bound facade supplied only while one plugin configures an Engine.
 *
 * @remarks
 * The facade is scoped to one plugin definition and one awaited `configureEngine`
 * invocation. `pika` and `typegen` capabilities close when that invocation
 * settles. `runtime` is the underlying Engine for existing Engine APIs.
 */
export interface EngineConfigurator<State = any> extends EnginePluginContext<State> {
	/** Underlying Engine being configured. */
	readonly runtime: Engine
	/** Owner-bound Pika registration capability for this configureEngine invocation. */
	readonly pika: PikaRegistrationCapability
	/** Owner-bound Typegen registration capability for this configureEngine invocation. */
	readonly typegen: TypegenRegistrationCapability
}

const VOID_HOOKS = new Set<EngineHookName>([
	'preflightUpdated',
])

const DEFAULT_PLUGIN_CONTEXT: EnginePluginContext<any> = {
	onDiagnostic: noopDiagnosticHandler,
	state: undefined,
	host: {},
}

/**
 * Resolves the per-plugin hook context: either a fixed context shared by all
 * plugins (bare `execAsyncHook`/`execSyncHook` calls, no engine-local state)
 * or a per-plugin resolver installed by `createEngineHooks` (#116).
 */
type StaticPluginContext = Pick<EnginePluginContext<any>, 'onDiagnostic' | 'state' | 'host'>
type PluginContextSource = StaticPluginContext | ((plugin: EnginePlugin) => EnginePluginContext<any>)

function resolvePluginContext(source: PluginContextSource, plugin: EnginePlugin): EnginePluginContext<any> {
	return typeof source === 'function' ? source(plugin) : source
}

function getPluginHook(plugin: EnginePlugin, hook: EngineHookName) {
	const pluginRecord = plugin as unknown as Record<string, unknown>
	const hookFn = pluginRecord[hook]
	return typeof hookFn === 'function'
		? hookFn as (...args: any[]) => unknown
		: null
}

function invokePluginHook(
	hookFn: (...args: any[]) => unknown,
	hook: EngineHookName,
	payload: unknown,
	context: EnginePluginContext<any>,
) {
	return VOID_HOOKS.has(hook)
		? hookFn(context)
		: hookFn(payload, context)
}

function applyHookPayload(current: unknown, next: unknown) {
	return next ?? current
}

function logHookStart(kind: 'Sync' | 'Async', hook: EngineHookName) {
	log.debug(`Executing ${kind.toLowerCase()} hook: ${hook}`)
}

function logHookEnd(kind: 'Sync' | 'Async', hook: EngineHookName) {
	log.debug(`${kind} hook "${hook}" completed`)
}

function logPluginHookStart(plugin: EnginePlugin, hook: EngineHookName) {
	log.debug(`  - Plugin "${plugin.name}" executing ${hook}`)
}

function logPluginHookEnd(plugin: EnginePlugin, hook: EngineHookName) {
	log.debug(`  - Plugin "${plugin.name}" completed ${hook}`)
}

function reportPluginHookError(
	context: EnginePluginContext<any>,
	plugin: EnginePlugin,
	hook: EngineHookName,
	error: unknown,
) {
	const message = `Plugin "${plugin.name}" failed to execute hook "${hook}": ${error instanceof Error ? error.message : String(error)}`
	if (context.onDiagnostic === noopDiagnosticHandler) {
		log.error(message, error)
		return
	}
	emitDiagnostic(context.onDiagnostic, {
		level: 'error',
		code: 'plugin-hook-error',
		message,
		cause: error,
		plugin: plugin.name,
		hook,
	})
}

/**
 * Executes an async hook across all plugins in order, piping the payload through each handler.
 *
 * @internal
 * @remarks A thrown plugin error is reported through the supplied diagnostic context and then
 * rethrown. The engine never converts a failed lifecycle into a silently partial result.
 */
export async function execAsyncHook<P>(
	plugins: readonly EnginePlugin[],
	hook: AsyncHooksNames,
	payload: P,
	context: PluginContextSource = DEFAULT_PLUGIN_CONTEXT,
): Promise<P> {
	logHookStart('Async', hook)
	let current: unknown = payload
	for (const plugin of plugins) {
		const hookFn = getPluginHook(plugin, hook)
		if (hookFn == null)
			continue

		const pluginContext = resolvePluginContext(context, plugin)
		try {
			logPluginHookStart(plugin, hook)
			current = applyHookPayload(current, await invokePluginHook(hookFn, hook, current, pluginContext))
			logPluginHookEnd(plugin, hook)
		}
		catch (error: unknown) {
			reportPluginHookError(pluginContext, plugin, hook, error)
			throw error
		}
	}
	logHookEnd('Async', hook)
	return current as P
}

/**
 * Executes a synchronous hook across all plugins in order, piping the payload through each handler.
 *
 * @internal
 * @remarks A thrown plugin error is reported through the supplied diagnostic context and then
 * rethrown. Notification hooks therefore cannot fail silently.
 */
export function execSyncHook<P>(
	plugins: readonly EnginePlugin[],
	hook: SyncHooksNames,
	payload: P,
	context: PluginContextSource = DEFAULT_PLUGIN_CONTEXT,
): P {
	logHookStart('Sync', hook)
	let current: unknown = payload
	for (const plugin of plugins) {
		const hookFn = getPluginHook(plugin, hook)
		if (hookFn == null)
			continue

		const pluginContext = resolvePluginContext(context, plugin)
		try {
			logPluginHookStart(plugin, hook)
			current = applyHookPayload(current, invokePluginHook(hookFn, hook, current, pluginContext))
			logPluginHookEnd(plugin, hook)
		}
		catch (error: unknown) {
			reportPluginHookError(pluginContext, plugin, hook, error)
			throw error
		}
	}
	logHookEnd('Sync', hook)
	return current as P
}

type HookParams<H extends [type: 'sync' | 'async', payload: any, returnValue?: any]>
	= H[1] extends void ? [] : [payload: H[1]]

// The context parameter is required in the type: the engine always supplies
// it, so hook implementations can use `context.state` without a non-null
// assertion (implementations that ignore it simply omit the parameter).
type PluginHookParams<H extends [type: 'sync' | 'async', payload: any, returnValue?: any], State = any>
	= H[1] extends void
		? [context: EnginePluginContext<State>]
		: [payload: H[1], context: EnginePluginContext<State>]

type HookReturnType<H extends [type: 'sync' | 'async', payload: any, returnValue?: any]>
	= H extends [any, any, infer R]
		? H[0] extends 'async' ? Promise<R> : R
		: H[0] extends 'async' ? Promise<H[1]> : H[1]

type EngineHooks = {
	[K in keyof EngineHooksDefinition]: (
		plugins: EnginePlugin[],
		...params: HookParams<EngineHooksDefinition[K]>
	) => HookReturnType<EngineHooksDefinition[K]>
}

/**
 * Creates an engine-local hook dispatcher bound to one diagnostic context.
 *
 * @internal
 * @remarks
 * Each dispatcher instance owns one plugin-context store: every plugin
 * definition gets exactly one `EnginePluginContext` (with `state` initialized
 * lazily via `createState()`) per dispatcher — i.e. per engine, since
 * `createEngine` creates one dispatcher per engine (#116). The same plugin
 * definition used with another dispatcher/engine gets a distinct context and
 * distinct state.
 */
export function createEngineHooks(context: Pick<EnginePluginContext, 'onDiagnostic'> & Partial<Pick<EnginePluginContext, 'host'>>): EngineHooks {
	// Initialization is a single-shot engine-local lifecycle outcome, INCLUDING
	// failure: a throwing createState() is cached and rethrown on every later
	// hook of that plugin/engine pair, never retried — retrying would violate
	// the at-most-once initializer contract (#116). The failure is reported
	// once as a structured diagnostic so plugin authors keep the same
	// observability as ordinary hook errors.
	type PluginContextEntry
		= | { status: 'ok', context: EnginePluginContext<any> }
			| { status: 'failed', error: unknown }
	const pluginContexts = new WeakMap<EnginePlugin, PluginContextEntry>()
	// One host-context object per dispatcher/engine, shared by every plugin
	// context it creates (#118) — host metadata is engine-scoped, not
	// plugin-scoped.
	const host = context.host ?? {}
	const contextFor = (plugin: EnginePlugin): EnginePluginContext<any> => {
		let entry = pluginContexts.get(plugin)
		if (entry == null) {
			try {
				entry = {
					status: 'ok',
					context: {
						onDiagnostic: context.onDiagnostic,
						state: plugin.createState?.(),
						host,
					},
				}
			}
			catch (error: unknown) {
				entry = { status: 'failed', error }
				emitDiagnostic(context.onDiagnostic, {
					level: 'error',
					code: 'plugin-state-init-error',
					message: `Plugin "${plugin.name}" failed to initialize its engine-local state: ${error instanceof Error ? error.message : String(error)}`,
					cause: error,
					plugin: plugin.name,
				})
			}
			pluginContexts.set(plugin, entry)
		}
		if (entry.status === 'failed')
			throw entry.error
		return entry.context
	}
	const configureEngine = async (plugins: EnginePlugin[], engine: Engine): Promise<Engine> => {
		logHookStart('Async', 'configureEngine')
		for (const plugin of plugins) {
			const hookFn = getPluginHook(plugin, 'configureEngine')
			if (hookFn == null)
				continue

			const pluginContext = contextFor(plugin)
			const pikaRegistration = createPikaRegistrationController(engine.pika, plugin)
			const typegenRegistration = createTypegenRegistrationController(engine.typegen, plugin)
			const configurator: EngineConfigurator<any> = Object.freeze({
				...pluginContext,
				runtime: engine,
				pika: pikaRegistration.capability,
				typegen: typegenRegistration.capability,
			})
			pikaRegistration.open()
			typegenRegistration.open()
			try {
				logPluginHookStart(plugin, 'configureEngine')
				await hookFn(configurator)
				logPluginHookEnd(plugin, 'configureEngine')
			}
			catch (error: unknown) {
				reportPluginHookError(pluginContext, plugin, 'configureEngine', error)
				throw error
			}
			finally {
				pikaRegistration.close()
				typegenRegistration.close()
			}
		}
		logHookEnd('Async', 'configureEngine')
		return engine
	}

	return {
		configureRawConfig: (plugins: EnginePlugin[], config: EngineConfig) =>
			execAsyncHook(plugins, 'configureRawConfig', config, contextFor),
		rawConfigConfigured: (plugins: EnginePlugin[], config: EngineConfig) =>
			execSyncHook(plugins, 'rawConfigConfigured', config, contextFor),
		configureResolvedConfig: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) =>
			execAsyncHook(plugins, 'configureResolvedConfig', resolvedConfig, contextFor),
		configureEngine,
		transformSelectors: (plugins: EnginePlugin[], selectors: string[]) =>
			execAsyncHook(plugins, 'transformSelectors', selectors, contextFor),
		transformStyleItems: (plugins: EnginePlugin[], styleItems: ResolvedStyleItem[]) =>
			execAsyncHook(plugins, 'transformStyleItems', styleItems, contextFor),
		transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: ResolvedStyleDefinition[]) =>
			execAsyncHook(plugins, 'transformStyleDefinitions', styleDefinitions, contextFor),
		transformStyleContents: (plugins: EnginePlugin[], styleContents: StyleContent[]) =>
			execAsyncHook(plugins, 'transformStyleContents', styleContents, contextFor),
		preflightUpdated: (plugins: EnginePlugin[]) =>
			execSyncHook(plugins, 'preflightUpdated', void 0, contextFor),
		atomicStyleAdded: (plugins: EnginePlugin[], atomicStyle: AtomicStyle) =>
			execSyncHook(plugins, 'atomicStyleAdded', atomicStyle, contextFor),
	}
}

/**
 * Backward-compatible hook dispatcher using the default no-op diagnostic context.
 *
 * @internal
 * @remarks Not engine-scoped: this module-level facade owns a single plugin-context
 * store, so every caller shares one state per plugin definition (#116). Use
 * `createEngineHooks` for engine-lifecycle dispatching.
 */
export const hooks: EngineHooks = createEngineHooks(DEFAULT_PLUGIN_CONTEXT)

type EnginePluginHooksOptions<State = any> = {
	[K in keyof EngineHooksDefinition]?: K extends 'configureEngine'
		? (configurator: EngineConfigurator<State>) => Awaitable<void>
		: EngineHooksDefinition[K][0] extends 'async'
			? (...params: PluginHookParams<EngineHooksDefinition[K], State>) => Awaitable<EngineHooksDefinition[K][1] | void>
			: (...params: PluginHookParams<EngineHooksDefinition[K], State>) => EngineHooksDefinition[K][1] | void
}

/**
 * Describes an engine plugin that can hook into the PikaCSS engine lifecycle.
 *
 * @remarks
 * A plugin object is a reusable **definition**, not a single-engine resource
 * (#116): the same object may be passed to any number of `createEngine()`
 * calls, sequentially or concurrently. Mutable per-engine data therefore must
 * never live in the plugin factory's closure — declare it via `createState`
 * and read/write it through hook `context.state` or `EngineConfigurator.state`, which the engine keeps isolated
 * per plugin/engine pair. Factory arguments that are never mutated may stay in
 * the closure as immutable definition configuration.
 */
export interface EnginePlugin<State = any> extends EnginePluginHooksOptions<State> {
	/** The unique human-readable name identifying this plugin in diagnostics. */
	name: string
	/** Controls execution order relative to other plugins. */
	order?: 'pre' | 'post'
	/**
	 * Initializes this plugin's engine-local state.
	 *
	 * @returns The fresh state for one engine.
	 *
	 * @remarks
	 * Invoked by the engine at most once per plugin definition **per engine**,
	 * before the first hook of this plugin runs for that engine; every hook
	 * invocation of that plugin/engine pair then receives the same object via
	 * `context.state`. Another engine reusing the same definition gets a
	 * distinct state object. Stateless plugins simply omit this.
	 */
	createState?: () => State
}

const orderMap = new Map([
	[void 0, 1],
	['pre', 0],
	['post', 2],
])

/**
 * Sorts plugins by `pre`, default, then `post` order without mutating the input.
 *
 * @internal
 */
export function resolvePlugins(plugins: EnginePlugin[]): EnginePlugin[] {
	return [...plugins].sort((a, b) => orderMap.get(a.order)! - orderMap.get(b.order)!)
}

// Only for type inference without runtime effect
/* c8 ignore start */
/**
 * Identity helper that provides type inference for an engine plugin definition.
 *
 * @param plugin - The plugin definition to return unchanged.
 * @returns The same plugin instance.
 *
 * @remarks
 * When the plugin declares `createState`, the state type is inferred from its
 * return value and every hook's `context.state` is typed accordingly.
 */
export function defineEnginePlugin<State = void>(plugin: EnginePlugin<State>): EnginePlugin<State> {
	return plugin
}
/* c8 ignore end */
