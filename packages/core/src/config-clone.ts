import type { EngineConfig } from './types'

/**
 * Deep-copies ordinary config data while preserving behavioral identities.
 *
 * Recursively isolated (fresh copies): plain objects (null or Object
 * prototype, third-party augmented fields included), arrays, `Map` keys and
 * values, `Set` values, `Date`, `RegExp` (with `lastIndex`).
 *
 * Identity-preserved (returned as-is): primitives, functions/callbacks, and
 * any other non-plain instance (class instances, typed arrays, promises, …) —
 * Core cannot know a safe clone semantic for those, so they are treated as
 * opaque immutable values.
 *
 * Cycles and diamond references between plain objects/arrays/Maps/Sets are
 * preserved through `seen`; `Date`/`RegExp` diamonds become independent
 * value copies (they are immutable-by-convention config data).
 */
function cloneConfigValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
	if (typeof value !== 'object' || value == null)
		return value

	const cached = seen.get(value)
	if (cached != null)
		return cached

	if (Array.isArray(value)) {
		const copy: unknown[] = []
		seen.set(value, copy)
		for (const item of value)
			copy.push(cloneConfigValue(item, seen))
		return copy
	}

	if (value instanceof Date)
		return new Date(value.getTime())

	if (value instanceof RegExp) {
		const copy = new RegExp(value.source, value.flags)
		copy.lastIndex = value.lastIndex
		return copy
	}

	if (value instanceof Map) {
		const copy = new Map<unknown, unknown>()
		seen.set(value, copy)
		for (const [key, entry] of value)
			copy.set(cloneConfigValue(key, seen), cloneConfigValue(entry, seen))
		return copy
	}

	if (value instanceof Set) {
		const copy = new Set<unknown>()
		seen.set(value, copy)
		for (const item of value)
			copy.add(cloneConfigValue(item, seen))
		return copy
	}

	const prototype = Object.getPrototypeOf(value)
	if (prototype !== Object.prototype && prototype !== null)
		return value

	// Preserve the source prototype: a null-prototype record must stay a
	// null-prototype record (inherited-property semantics differ from `{}`).
	const copy: Record<string, unknown> = prototype === null ? Object.create(null) : {}
	seen.set(value, copy)
	for (const [key, entry] of Object.entries(value)) {
		if (key === '__proto__') {
			// A legitimate own "__proto__" data key must be written as data —
			// plain assignment would route through the Object.prototype setter
			// on ordinary objects and silently drop the entry.
			Object.defineProperty(copy, key, {
				value: cloneConfigValue(entry, seen),
				enumerable: true,
				writable: true,
				configurable: true,
			})
		}
		else {
			copy[key] = cloneConfigValue(entry, seen)
		}
	}
	return copy
}

/**
 * Creates the engine-local mutable working copy of a caller-owned config.
 * @internal
 *
 * @param config - The caller-owned engine configuration.
 * @returns An independent working config for one `createEngine()` invocation.
 *
 * @remarks
 * `createEngine(config)` treats the caller's `EngineConfig` graph as
 * immutable input (#117): plugin configuration hooks mutate this working
 * copy, never the caller's objects, so one caller config can be reused
 * across sequential or concurrent engine creations without accumulating
 * setup mutations. Ordinary config data is recursively isolated —
 * including module-augmented third-party fields; functions and opaque
 * class instances keep their identity; and the `plugins` array is copied
 * while the `EnginePlugin` definition objects inside it keep their
 * identity, per the #116 reusable-definition contract (per-engine plugin
 * state is keyed by definition identity).
 */
export function cloneEngineConfig(config: EngineConfig): EngineConfig {
	// Copy the plugins container, never the definitions: plugin objects are
	// reusable identities (#116) that external consumers may hold references
	// to (their own WeakMaps, `plugins.includes(...)` checks); per-engine
	// plugin state itself is already isolated structurally by each engine's
	// dispatcher. Seeding the memo makes this hold ANYWHERE a configured
	// definition appears in the extensible graph — augmented cross-references,
	// Map keys/values — not just inside the top-level `plugins` array, and
	// keeps `workingConfig.plugins[0] === augmentedAlias` aliasing intact.
	const seen = new WeakMap<object, unknown>()
	const plugins = config.plugins
	if (plugins != null) {
		seen.set(plugins, [...plugins])
		for (const plugin of plugins) {
			if (typeof plugin === 'object' && plugin != null)
				seen.set(plugin, plugin)
		}
	}
	return cloneConfigValue(config, seen) as EngineConfig
}
