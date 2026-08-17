import type { EnginePluginContext } from './diagnostics'
import type { Engine } from './engine'
import type { AtomicStyle, Awaitable, EngineConfig, ResolvedEngineConfig, ResolvedStyleDefinition, ResolvedStyleItem, StyleContent } from './types'
import { emitDiagnostic, noopDiagnosticHandler } from './diagnostics'
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
	autocompleteConfigUpdated: ['sync', void]
}>

type GetHooksNames<
	T extends 'sync' | 'async',
	K extends keyof EngineHooksDefinition = keyof EngineHooksDefinition,
> = K extends keyof EngineHooksDefinition ? EngineHooksDefinition[K][0] extends T ? K : never : never

type SyncHooksNames = GetHooksNames<'sync'>
type AsyncHooksNames = GetHooksNames<'async'>
type EngineHookName = keyof EngineHooksDefinition

const VOID_HOOKS = new Set<EngineHookName>([
	'preflightUpdated',
	'autocompleteConfigUpdated',
])

const DEFAULT_PLUGIN_CONTEXT: EnginePluginContext = {
	onDiagnostic: noopDiagnosticHandler,
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
	context: EnginePluginContext,
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
	context: EnginePluginContext,
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
	context: EnginePluginContext = DEFAULT_PLUGIN_CONTEXT,
): Promise<P> {
	logHookStart('Async', hook)
	let current: unknown = payload
	for (const plugin of plugins) {
		const hookFn = getPluginHook(plugin, hook)
		if (hookFn == null)
			continue

		try {
			logPluginHookStart(plugin, hook)
			current = applyHookPayload(current, await invokePluginHook(hookFn, hook, current, context))
			logPluginHookEnd(plugin, hook)
		}
		catch (error: unknown) {
			reportPluginHookError(context, plugin, hook, error)
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
	context: EnginePluginContext = DEFAULT_PLUGIN_CONTEXT,
): P {
	logHookStart('Sync', hook)
	let current: unknown = payload
	for (const plugin of plugins) {
		const hookFn = getPluginHook(plugin, hook)
		if (hookFn == null)
			continue

		try {
			logPluginHookStart(plugin, hook)
			current = applyHookPayload(current, invokePluginHook(hookFn, hook, current, context))
			logPluginHookEnd(plugin, hook)
		}
		catch (error: unknown) {
			reportPluginHookError(context, plugin, hook, error)
			throw error
		}
	}
	logHookEnd('Sync', hook)
	return current as P
}

type HookParams<H extends [type: 'sync' | 'async', payload: any, returnValue?: any]>
	= H[1] extends void ? [] : [payload: H[1]]

type PluginHookParams<H extends [type: 'sync' | 'async', payload: any, returnValue?: any]>
	= H[1] extends void
		? [context?: EnginePluginContext]
		: [payload: H[1], context?: EnginePluginContext]

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
 */
export function createEngineHooks(context: EnginePluginContext): EngineHooks {
	return {
		configureRawConfig: (plugins: EnginePlugin[], config: EngineConfig) =>
			execAsyncHook(plugins, 'configureRawConfig', config, context),
		rawConfigConfigured: (plugins: EnginePlugin[], config: EngineConfig) =>
			execSyncHook(plugins, 'rawConfigConfigured', config, context),
		configureResolvedConfig: (plugins: EnginePlugin[], resolvedConfig: ResolvedEngineConfig) =>
			execAsyncHook(plugins, 'configureResolvedConfig', resolvedConfig, context),
		configureEngine: (plugins: EnginePlugin[], engine: Engine) =>
			execAsyncHook(plugins, 'configureEngine', engine, context),
		transformSelectors: (plugins: EnginePlugin[], selectors: string[]) =>
			execAsyncHook(plugins, 'transformSelectors', selectors, context),
		transformStyleItems: (plugins: EnginePlugin[], styleItems: ResolvedStyleItem[]) =>
			execAsyncHook(plugins, 'transformStyleItems', styleItems, context),
		transformStyleDefinitions: (plugins: EnginePlugin[], styleDefinitions: ResolvedStyleDefinition[]) =>
			execAsyncHook(plugins, 'transformStyleDefinitions', styleDefinitions, context),
		transformStyleContents: (plugins: EnginePlugin[], styleContents: StyleContent[]) =>
			execAsyncHook(plugins, 'transformStyleContents', styleContents, context),
		preflightUpdated: (plugins: EnginePlugin[]) =>
			execSyncHook(plugins, 'preflightUpdated', void 0, context),
		atomicStyleAdded: (plugins: EnginePlugin[], atomicStyle: AtomicStyle) =>
			execSyncHook(plugins, 'atomicStyleAdded', atomicStyle, context),
		autocompleteConfigUpdated: (plugins: EnginePlugin[]) =>
			execSyncHook(plugins, 'autocompleteConfigUpdated', void 0, context),
	}
}

/**
 * Backward-compatible hook dispatcher using the default no-op diagnostic context.
 *
 * @internal
 */
export const hooks: EngineHooks = createEngineHooks(DEFAULT_PLUGIN_CONTEXT)

type EnginePluginHooksOptions = {
	[K in keyof EngineHooksDefinition]?: EngineHooksDefinition[K][0] extends 'async'
		? (...params: PluginHookParams<EngineHooksDefinition[K]>) => Awaitable<EngineHooksDefinition[K][1] | void>
		: (...params: PluginHookParams<EngineHooksDefinition[K]>) => EngineHooksDefinition[K][1] | void
}

/** Describes an engine plugin that can hook into the PikaCSS engine lifecycle. */
export interface EnginePlugin extends EnginePluginHooksOptions {
	/** The unique human-readable name identifying this plugin in diagnostics. */
	name: string
	/** Controls execution order relative to other plugins. */
	order?: 'pre' | 'post'
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
 */
export function defineEnginePlugin(plugin: EnginePlugin): EnginePlugin {
	return plugin
}
/* c8 ignore end */
