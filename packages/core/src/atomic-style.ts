import type { AtomicStyleIdStrategy } from './diagnostics'
import type { AtomicStyle, ExtractedStyleContent, StyleContent } from './types'
import { hasPropertyEffectOverlap } from './property-effects'
import { log, serialize } from './utils'

/**
 * Mutable store holding all resolved atomic styles and their lookup indices for an engine instance.
 * @internal
 *
 * @remarks The store is created once per engine and mutated as new styles are resolved via `engine.use()`. It maintains four related indices: content-hash to ID, ID to full atomic style, base-key to ID list (for order-sensitive reuse), and ID to insertion order.
 *
 * @example
 * ```ts
 * const store = createEngineStore()
 * // store.atomicStyleIds: Map<serializedKey, 'pk-a'>
 * ```
 */
export interface EngineStore {
	/** Map from serialized content keys to their assigned atomic style IDs. */
	atomicStyleIds: Map<string, string>
	/** Map from atomic style ID to the full `AtomicStyle` object. */
	atomicStyles: Map<string, AtomicStyle>
	/** Map from base content key to the list of atomic style IDs that share it (for order-sensitive styles). */
	atomicStyleIdsByBaseKey: Map<string, string[]>
	/** Map from atomic style ID to its insertion order index, used for deterministic output ordering. */
	atomicStyleOrder: Map<string, number>
}

interface AtomicStyleResolution {
	id: string
	atomicStyle?: AtomicStyle
}

/**
 * Creates a fresh, empty `EngineStore` with all maps initialized.
 * @internal
 *
 * @returns A new `EngineStore` instance with empty maps.
 *
 * @remarks Called once during engine construction. Each engine instance owns a single store.
 *
 * @example
 * ```ts
 * const store = createEngineStore()
 * store.atomicStyles.size // 0
 * ```
 */
export function createEngineStore(): EngineStore {
	return {
		atomicStyleIds: new Map<string, string>(),
		atomicStyles: new Map<string, AtomicStyle>(),
		atomicStyleIdsByBaseKey: new Map<string, string[]>(),
		atomicStyleOrder: new Map<string, number>(),
	}
}

/**
 * Assigns or retrieves a compact atomic style ID for the given resolved style content.
 * @internal
 *
 * @param options - Object containing the style `content`, the engine `prefix`, the `stored` ID map, and the resolved allocation strategy.
 * @param options.content - The resolved style content to hash and identify.
 * @param options.prefix - The class-name prefix used when constructing a new atomic style ID.
 * @param options.stored - The map that caches assigned IDs by serialized key.
 * @param options.atomicStyleIdStrategy - Engine-owned strategy used only when a new ID is required.
 * @returns The short alphabetic ID string (e.g. `'pk-a'`, `'pk-bA'`).
 *
 * @remarks For non-order-sensitive content, returns a cached ID if one already exists for the same base key. For order-sensitive content (where `orderSensitiveTo` is set), always generates a new ID to prevent incorrect reuse across different call-site orderings.
 *
 * @example
 * ```ts
 * const id = getAtomicStyleId({ content, prefix: 'pk-', stored: store.atomicStyleIds, atomicStyleIdStrategy })
 * // 'pk-a'
 * ```
 */
export function getAtomicStyleId({
	content,
	prefix,
	stored,
	atomicStyleIdStrategy,
}: {
	content: StyleContent
	prefix: string
	stored: Map<string, string>
	atomicStyleIdStrategy: AtomicStyleIdStrategy
}) {
	const baseKey = getAtomicStyleBaseKey(content)
	if (isOrderSensitiveContent(content) === false) {
		const cached = stored.get(baseKey)
		if (cached != null) {
			log.debug(`Atomic style cached: ${cached}`)
			return cached
		}
	}

	const index = stored.size
	const id = atomicStyleIdStrategy({ index, prefix })
	const key = getAtomicStyleStoredKey({ content, baseKey, num: index })
	stored.set(key, id)
	log.debug(`Generated new atomic style ID: ${id}`)
	return id
}

/**
 * Resolves a `StyleContent` into an atomic style: either reusing an existing ID or creating a new `AtomicStyle` entry in the store.
 * @internal
 *
 * @param options - Object containing the style `content`, `prefix`, `store`, the per-use-call `resolvedIdsByBaseKey` map, and the engine-owned allocation strategy.
 * @param options.content - The style content to resolve into a cached or newly registered atomic style.
 * @param options.prefix - The atomic style ID prefix for any newly created IDs.
 * @param options.store - The engine store holding existing atomic styles and lookup maps.
 * @param options.resolvedIdsByBaseKey - Per-call memoization map for reusing order-sensitive IDs within one `engine.use()` execution.
 * @param options.atomicStyleIdStrategy - Engine-owned strategy used only at the new-allocation boundary.
 * @returns An `AtomicStyleResolution` with the assigned `id` and optionally the newly created `atomicStyle` (absent when the ID was already registered).
 *
 * @remarks First checks for reusable order-sensitive IDs within the current `engine.use()` call, then falls back to `getAtomicStyleId` for general ID assignment. When a new atomic style is created, it is registered in all store indices.
 *
 * @example
 * ```ts
 * const { id, atomicStyle } = resolveAtomicStyle({
 *   content, prefix: 'pk-', store, resolvedIdsByBaseKey, atomicStyleIdStrategy,
 * })
 * ```
 */
export function resolveAtomicStyle({
	content,
	prefix,
	store,
	resolvedIdsByBaseKey,
	atomicStyleIdStrategy,
}: {
	content: StyleContent
	prefix: string
	store: EngineStore
	resolvedIdsByBaseKey: Map<string, string>
	atomicStyleIdStrategy: AtomicStyleIdStrategy
}): AtomicStyleResolution {
	const reusableId = findReusableAtomicStyleId({
		content,
		store,
		resolvedIdsByBaseKey,
	})
	if (reusableId != null) {
		log.debug(`Atomic style reused: ${reusableId}`)
		return { id: reusableId }
	}

	const id = getAtomicStyleId({
		content,
		prefix,
		stored: store.atomicStyleIds,
		atomicStyleIdStrategy,
	})
	if (store.atomicStyles.has(id))
		return { id }

	const atomicStyle: AtomicStyle = { id, content }
	registerAtomicStyle(store, atomicStyle)
	return { id, atomicStyle }
}

/**
 * Deduplicates and optimizes a list of extracted style contents by merging duplicate selector-property pairs and detecting order-sensitive shorthand overlaps.
 * @internal
 * @param list - The raw extracted style contents to optimize.
 * @returns An optimized array of `StyleContent` entries with nullish-value removals applied and `orderSensitiveTo` metadata attached where needed.
 *
 * @remarks Later definitions of the same selector-property pair cancel earlier ones. When two properties in the same scope share overlapping CSS effects (e.g. `margin` and `margin-top`), the later one is marked as order-sensitive to prevent incorrect ID reuse.
 *
 * @example
 * ```ts
 * const optimized = optimizeAtomicStyleContents(extractedList)
 * ```
 */
export function optimizeAtomicStyleContents(list: ExtractedStyleContent[]) {
	const map = new Map<string, StyleContent>()
	const scopedEntries = new Map<string, Map<string, StyleContent>>()
	list.forEach((content) => {
		const scopeKey = serialize(content.selector)
		const key = serialize([content.selector, content.property])
		const scoped = scopedEntries.get(scopeKey) || new Map<string, StyleContent>()
		scopedEntries.set(scopeKey, scoped)

		map.delete(key)
		scoped.delete(key)

		if (content.value == null)
			return

		const { selector, property, value } = content
		const nextContent: StyleContent = { selector, property, value }
		const dependencyKeys = getOrderSensitiveDependencyKeys(scoped, property)
		if (dependencyKeys.length > 0)
			nextContent.orderSensitiveTo = dependencyKeys

		map.set(key, nextContent)
		scoped.set(key, nextContent)
	})
	return [...map.values()]
}

/**
 * Computes the base cache key for an atomic style from its selector, property, and value.
 * @internal
 *
 * @param content - An object with `selector`, `property`, and `value` fields.
 * @returns A deterministic serialized string key.
 *
 * @remarks Used for deduplication: two atomic styles with the same base key are considered equivalent (unless order-sensitive). The key is derived by serializing the triple `[selector, property, value]`.
 *
 * @example
 * ```ts
 * const key = getAtomicStyleBaseKey({ selector: ['.pk-__ID__'], property: 'color', value: ['red'] })
 * ```
 */
export function getAtomicStyleBaseKey(content: Pick<StyleContent, 'selector' | 'property' | 'value'>) {
	return serialize([content.selector, content.property, content.value])
}

function getAtomicStyleStoredKey({
	content,
	baseKey,
	num,
}: {
	content: StyleContent
	baseKey: string
	num: number
}) {
	return isOrderSensitiveContent(content)
		? serialize([baseKey, 'order-sensitive', num])
		: baseKey
}

function isOrderSensitiveContent(content: StyleContent) {
	return (content.orderSensitiveTo?.length ?? 0) > 0
}

function registerAtomicStyle(
	store: EngineStore,
	atomicStyle: AtomicStyle,
) {
	const { id, content } = atomicStyle
	const baseKey = getAtomicStyleBaseKey(content)
	store.atomicStyleOrder.set(id, store.atomicStyles.size)
	store.atomicStyles.set(id, atomicStyle)
	const ids = store.atomicStyleIdsByBaseKey.get(baseKey)
	if (ids == null)
		store.atomicStyleIdsByBaseKey.set(baseKey, [id])
	else
		ids.push(id)
}

function getRequiredAtomicStyleOrder({
	dependencyKeys,
	store,
	resolvedIdsByBaseKey,
}: {
	dependencyKeys: string[]
	store: EngineStore
	resolvedIdsByBaseKey: Map<string, string>
}) {
	let requiredOrder = -1
	for (const dependencyKey of dependencyKeys) {
		const dependencyId = resolvedIdsByBaseKey.get(dependencyKey)
			?? store.atomicStyleIds.get(dependencyKey)
		if (dependencyId == null)
			continue
		const dependencyOrder = store.atomicStyleOrder.get(dependencyId)
		if (dependencyOrder != null)
			requiredOrder = Math.max(requiredOrder, dependencyOrder)
	}
	return requiredOrder
}

function findReusableAtomicStyleId({
	content,
	store,
	resolvedIdsByBaseKey,
}: {
	content: StyleContent
	store: EngineStore
	resolvedIdsByBaseKey: Map<string, string>
}) {
	const baseKey = getAtomicStyleBaseKey(content)
	const requiredOrder = getRequiredAtomicStyleOrder({
		dependencyKeys: content.orderSensitiveTo ?? [],
		store,
		resolvedIdsByBaseKey,
	})
	return (store.atomicStyleIdsByBaseKey.get(baseKey) ?? [])
		.find((candidateId) => {
			const candidateOrder = store.atomicStyleOrder.get(candidateId)
			return candidateOrder != null && candidateOrder > requiredOrder
		})
}

function getOrderSensitiveDependencyKeys(scoped: Map<string, StyleContent>, property: string) {
	const dependencyKeys: string[] = []
	for (const existing of scoped.values()) {
		if (hasPropertyEffectOverlap(existing.property, property))
			dependencyKeys.push(getAtomicStyleBaseKey(existing))
	}
	return dependencyKeys
}
