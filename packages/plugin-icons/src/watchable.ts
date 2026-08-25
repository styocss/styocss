import type { InlineCollection } from '@iconify/utils'
import type { Awaitable } from '@pikacss/core'

// Registry-scoped brand: distinguishes a watchable descriptor from ordinary
// inline icon maps without duck typing — icon names/keys stay unconstrained,
// and `Symbol.for` keeps the brand stable across duplicated module instances.
const WATCHABLE_ICON_COLLECTION = Symbol.for('pikacss:watchable-icon-collection')

/**
 * Identifies which icon request a per-request dependency declaration is for.
 */
export interface WatchableIconCollectionContext {
	/** The collection name the request targets (the key in `icons.collections`). */
	collection: string
	/** The requested icon name inside the collection. */
	name: string
}

/**
 * External resources that determine a watchable collection's resolved icons.
 *
 * @remarks
 * A string or array declares collection-wide dependencies and is registered
 * during Engine initialization. A function declares request-specific dependency
 * paths evaluated before the icon loader runs; in E1 those paths are supplied to
 * the loader context but do not mutate finalized Engine dependency state. E2
 * derives enumerable member/file dependencies during generation. Relative paths
 * resolve from the engine host's project root (#118); absolute paths are used as-is.
 */
export type IconCollectionDependencies
	= | string
		| string[]
		| ((context: WatchableIconCollectionContext) => Awaitable<string | string[]>)

/**
 * Context handed to a watchable collection's loader function.
 */
export interface WatchableIconSourceContext {
	/** The engine host's effective project root (#118), or `'.'` standalone. */
	projectRoot: string
	/** The request's declared dependencies, resolved to absolute paths, in declaration order. */
	dependencies: string[]
}

/**
 * A watchable collection's icon source: the existing custom-collection
 * behavior (an inline icon map, or a loader from icon name to SVG), where a
 * loader additionally receives the resolved dependency context.
 */
export type WatchableIconSource
	= | InlineCollection
		| ((name: string, context: WatchableIconSourceContext) => Awaitable<string | undefined>)

/**
 * A custom icon collection whose filesystem dependencies participate in
 * PikaCSS dependency metadata (#122). Collection-wide dependencies participate
 * in initialization-time watching; request-specific generation tracking is
 * completed by the E2 icon catalog workstream.
 *
 * @remarks Create via {@link defineWatchableIconCollection}; the descriptor is
 * configuration data and must be treated as immutable definition identity.
 */
export interface WatchableIconCollection {
	/**
	 * Brand marking the descriptor as watchable — never construct by hand; use `defineWatchableIconCollection`.
	 * @internal
	 */
	[WATCHABLE_ICON_COLLECTION]: true
	/** The collection's icon source (inline map or loader). */
	source: WatchableIconSource
	/** The external resources backing the collection's icons. */
	dependencies: IconCollectionDependencies
}

// Non-plain prototype on purpose: #117's config clone recursively copies
// plain objects (dropping symbol-keyed brands in the process) but preserves
// the identity of opaque instances. A watchable descriptor is immutable
// definition identity (#122), so it must survive the clone by reference.
const WATCHABLE_PROTOTYPE = Object.create(Object.prototype)

/**
 * Declares a custom icon collection whose backing files PikaCSS watches.
 *
 * @param options - The collection source plus its dependency declaration.
 * @param options.source - The collection's icon source: an inline map or a loader receiving `(name, sourceContext)`.
 * @param options.dependencies - The external resources backing the collection's icons.
 * @returns A branded descriptor accepted by `icons.collections`.
 *
 * @remarks
 * Ordinary `CustomCollections` entries stay fully supported and opaque —
 * PikaCSS cannot infer files an arbitrary loader reads. Collection-wide static
 * dependencies on this descriptor are registered during Engine initialization.
 * Request-specific dependency functions still resolve absolute paths and pass
 * them to the loader, but E1 deliberately does not reopen finalized Engine
 * dependency state; E2 supplies generation-aware enumerable member/file
 * tracking. Private caches inside a user-supplied loader remain outside
 * PikaCSS's invalidation guarantee.
 *
 * Pass the returned descriptor through UNMODIFIED: spreading it
 * (`{ ...descriptor }`) produces a plain object that silently loses the
 * watchable brand during engine-config cloning and degrades to an ordinary
 * opaque collection. Create a new descriptor instead of copying one.
 *
 * @example
 * ```ts
 * icons: {
 *   collections: {
 *     app: defineWatchableIconCollection({
 *       source: async (name, { dependencies: [file] }) => readSvgSomehow(file),
 *       dependencies: ({ name }) => `./icons/${name}.svg`,
 *     }),
 *   },
 * }
 * ```
 */
export function defineWatchableIconCollection(options: {
	source: WatchableIconSource
	dependencies: IconCollectionDependencies
}): WatchableIconCollection {
	const descriptor: WatchableIconCollection = Object.create(WATCHABLE_PROTOTYPE)
	descriptor[WATCHABLE_ICON_COLLECTION] = true
	descriptor.source = options.source
	descriptor.dependencies = options.dependencies
	return descriptor
}

/**
 * Type guard for {@link WatchableIconCollection} descriptors.
 * @internal
 *
 * @param value - Any `icons.collections` entry.
 * @returns Whether the value carries the watchable-collection brand.
 */
export function isWatchableIconCollection(value: unknown): value is WatchableIconCollection {
	return typeof value === 'object'
		&& value != null
		&& (value as Record<PropertyKey, unknown>)[WATCHABLE_ICON_COLLECTION] === true
}
