import type { Diagnostic, DiagnosticHandler } from './diagnostics'
import type { Awaitable, Nullish } from './types'
import { emitDiagnostic, noopDiagnosticHandler } from './diagnostics'
import { log } from './utils'

function stripGlobalFlag(re: RegExp): RegExp {
	if (!re.global)
		return re
	return new RegExp(re.source, re.flags.replace('g', ''))
}

/**
 * Wrapper holding a resolved value, used as the cache entry in resolver maps.
 * @internal
 *
 * @typeParam T - The type of the resolved value.
 *
 * @remarks Stored in `_resolvedResultsMap` to distinguish "resolved to a value" from "not yet resolved". The wrapper is mutable so `_setResolvedResult` can update it in place.
 *
 * @example
 * ```ts
 * const result: ResolvedResult<string[]> = { value: ['hover:'] }
 * ```
 */
export interface ResolvedResult<T> {
	/** The resolved value. */
	value: T
}

/**
 * A rule that matches an exact input string and returns a pre-computed resolved value.
 * @internal
 *
 * @typeParam T - The type of the resolved value.
 *
 * @remarks Static rules are checked first during resolution. If the input string matches `rule.string`, the `resolved` value is returned immediately without regex matching.
 *
 * @example
 * ```ts
 * const rule: StaticRule<string[]> = { key: 'hover', string: 'hover', resolved: ['$:hover'] }
 * ```
 */
export interface StaticRule<T> {
	/** Unique key used for registration, removal, and deduplication. */
	key: string
	/** The exact input string this rule matches. */
	string: string
	/** The pre-computed value returned when this rule matches. */
	resolved: T
}

/**
 * A rule that matches input strings via a regex pattern and lazily computes the resolved value from the match.
 * @internal
 *
 * @typeParam T - The type of the resolved value.
 *
 * @remarks Dynamic rules are tried in registration order after all static rules fail to match. The `stringPattern` must not have the global flag (it is stripped on creation). The `createResolved` callback receives the regex match array and may be async. Returning `undefined` or `null` signals a retryable-unresolved result: the input is treated as unresolved and no cache entry is stored, so a later resolve call re-invokes the rule (e.g. after a transient failure such as a network error).
 *
 * @example
 * ```ts
 * const rule: DynamicRule<string[]> = {
 *   key: 'media-\\d+',
 *   stringPattern: /^media-(\d+)$/,
 *   createResolved: async (m) => [`@media (min-width: ${m[1]}px)`],
 * }
 * ```
 */
export interface DynamicRule<T> {
	/** Unique key used for registration, removal, and deduplication. */
	key: string
	/** Regex pattern (without global flag) tested against input strings. */
	stringPattern: RegExp
	/** Factory function that computes the resolved value from the regex match. Returning `undefined`/`null` means retryable-unresolved: nothing is cached and the rule is re-invoked on a later resolve call. */
	createResolved: (matched: RegExpMatchArray) => Awaitable<T | Nullish>
}

/**
 * Base resolver class that manages static and dynamic rules and caches resolution results.
 * @internal
 *
 * @typeParam T - The type of resolved values.
 *
 * @remarks Subclasses override resolution behavior (e.g. `RecursiveResolver` adds recursive expansion). The base class handles rule storage, cache lookup, and the static-then-dynamic matching order. Results are cached in `_resolvedResultsMap` for subsequent lookups.
 *
 * @example
 * ```ts
 * class MyResolver extends AbstractResolver<string> { }
 * const r = new MyResolver()
 * r.addStaticRule({ key: 'x', string: 'x', resolved: 'X' })
 * ```
 */
export abstract class AbstractResolver<T> {
	/** Cache of previously resolved input-string → result pairs. */
	_resolvedResultsMap: Map<string, ResolvedResult<T>> = new Map()
	/** Negative cache of input strings that matched no rule at all. Retryable-unresolved dynamic results (a matched dynamic rule whose value fn returned nullish) are never stored here. */
	_unmatchedStrings: Set<string> = new Set()
	/** Index of static rules keyed by their exact match string (first registered rule wins on string collisions), giving O(1) static lookups. */
	_staticRulesByString: Map<string, StaticRule<T>> = new Map()
	/** Registry of static rules keyed by their unique key. */
	staticRulesMap: Map<string, StaticRule<T>> = new Map()
	/** Registry of dynamic rules keyed by their unique key. */
	dynamicRulesMap: Map<string, DynamicRule<T>> = new Map()
	/** Callback invoked after a successful resolution, receiving the input string, rule type, and result. */
	onResolved: (string: string, type: 'static' | 'dynamic', result: ResolvedResult<T>) => void = () => {}

	constructor(readonly onDiagnostic: DiagnosticHandler = noopDiagnosticHandler) {}

	/** Reports through the host handler, falling back to the optional logger only for standalone resolvers. */
	reportDiagnostic(diagnostic: Diagnostic): void {
		if (this.onDiagnostic === noopDiagnosticHandler) {
			const args = diagnostic.cause == null ? [] : [diagnostic.cause]
			if (diagnostic.level === 'error')
				log.error(diagnostic.message, ...args)
			else
				log.warn(diagnostic.message, ...args)
			return
		}
		emitDiagnostic(this.onDiagnostic, diagnostic)
	}

	get staticRules() {
		return [...this.staticRulesMap.values()]
	}

	get dynamicRules() {
		return [...this.dynamicRulesMap.values()]
	}

	/**
	 * Registers a static rule in the resolver.
	 *
	 * @param rule - The static rule to register.
	 * @returns `this` for chaining.
	 *
	 * @remarks Overwrites any existing static rule with the same key. The entire resolution cache is cleared because cached results (including recursively expanded ones) may depend on the previous rule.
	 *
	 * @example
	 * ```ts
	 * resolver.addStaticRule({ key: 'dark', string: 'dark', resolved: ['.dark &'] })
	 * ```
	 */
	addStaticRule(rule: StaticRule<T>) {
		log.debug(`Adding static rule: ${rule.key}`)
		const previous = this.staticRulesMap.get(rule.key)
		this.staticRulesMap.set(rule.key, rule)
		if (previous != null) {
			// Replacing a rule may change which rule wins for both the old and
			// the new match string; recompute both index entries.
			if (previous.string !== rule.string)
				this._reindexStaticRuleString(previous.string)
			this._reindexStaticRuleString(rule.string)
		}
		else if (this._staticRulesByString.has(rule.string) === false) {
			// Appended at the end of insertion order: an earlier rule with the
			// same string keeps winning, so only fill a missing entry.
			this._staticRulesByString.set(rule.string, rule)
		}
		this._resolvedResultsMap.clear()
		this._unmatchedStrings.clear()
		return this
	}

	/**
	 * Removes a static rule and its cached resolution result.
	 *
	 * @param key - The key of the static rule to remove.
	 * @returns `this` for chaining.
	 *
	 * @remarks Logs a warning if the key does not exist. The entire resolution cache is cleared because cached results (including recursively expanded ones) may depend on the removed rule.
	 *
	 * @example
	 * ```ts
	 * resolver.removeStaticRule('dark')
	 * ```
	 */
	removeStaticRule(key: string) {
		const rule = this.staticRulesMap.get(key)
		if (rule == null) {
			const message = `Static rule not found for removal: ${key}`
			this.reportDiagnostic({ level: 'warning', code: 'resolver-static-rule-not-found', message })
			return this
		}

		log.debug(`Removing static rule: ${key}`)
		this.staticRulesMap.delete(key)
		if (this._staticRulesByString.get(rule.string) === rule)
			this._reindexStaticRuleString(rule.string)
		this._resolvedResultsMap.clear()
		this._unmatchedStrings.clear()
		return this
	}

	/**
	 * Recomputes the string-index entry for a given match string after a rule mutation.
	 *
	 * @param string - The match string whose index entry should be recomputed.
	 *
	 * @remarks Scans `staticRulesMap` in insertion order so the first registered rule matching the string wins, mirroring the pre-index linear-scan behavior. Removes the entry when no rule matches the string anymore.
	 */
	_reindexStaticRuleString(string: string) {
		for (const rule of this.staticRulesMap.values()) {
			if (rule.string === string) {
				this._staticRulesByString.set(string, rule)
				return
			}
		}
		this._staticRulesByString.delete(string)
	}

	/**
	 * Registers a dynamic rule in the resolver.
	 *
	 * @param rule - The dynamic rule to register.
	 * @returns `this` for chaining.
	 *
	 * @remarks Overwrites any existing dynamic rule with the same key. The entire resolution cache is cleared because cached results (including recursively expanded ones) may depend on the previous rule.
	 *
	 * @example
	 * ```ts
	 * resolver.addDynamicRule({ key: 'bp', stringPattern: /^bp-(\d+)$/, createResolved: m => [`@media (min-width: ${m[1]}px)`] })
	 * ```
	 */
	addDynamicRule(rule: DynamicRule<T>) {
		log.debug(`Adding dynamic rule: ${rule.key}`)
		this.dynamicRulesMap.set(rule.key, rule)
		this._resolvedResultsMap.clear()
		this._unmatchedStrings.clear()
		return this
	}

	/**
	 * Removes a dynamic rule and evicts all cached results that its pattern matched.
	 *
	 * @param key - The key of the dynamic rule to remove.
	 * @returns `this` for chaining.
	 *
	 * @remarks Logs a warning if the key does not exist. The entire resolution cache is cleared because cached results (including recursively expanded ones) may depend on the removed rule.
	 *
	 * @example
	 * ```ts
	 * resolver.removeDynamicRule('bp')
	 * ```
	 */
	removeDynamicRule(key: string) {
		const rule = this.dynamicRulesMap.get(key)
		if (rule == null) {
			const message = `Dynamic rule not found for removal: ${key}`
			this.reportDiagnostic({ level: 'warning', code: 'resolver-dynamic-rule-not-found', message })
			return this
		}

		log.debug(`Removing dynamic rule: ${key}`)
		this.dynamicRulesMap.delete(key)
		this._resolvedResultsMap.clear()
		this._unmatchedStrings.clear()
		return this
	}

	/**
	 * Attempts to resolve an input string by checking cached results, then static rules, then dynamic rules in order.
	 *
	 * @param string - The input string to resolve.
	 * @returns The resolved result wrapper, or `null`/`undefined` if no rule matches.
	 *
	 * @remarks Results are cached for subsequent calls. Invokes `onResolved` after a successful match. Dynamic rule matching is async because `createResolved` may return a `Promise`. When a dynamic rule's `createResolved` returns `undefined`/`null`, the input is treated as unresolved and no cache entry is stored, so a later resolve call re-invokes the rule.
	 *
	 * @example
	 * ```ts
	 * const result = await resolver._resolve('hover')
	 * ```
	 */
	async _resolve(string: string): Promise<ResolvedResult<T> | Nullish> {
		const existedResult = this._resolvedResultsMap.get(string)
		if (existedResult != null) {
			log.debug(`Resolved from cache: ${string}`)
			return existedResult
		}

		if (this._unmatchedStrings.has(string)) {
			log.debug(`Resolution failed (cached): ${string}`)
			return void 0
		}

		const staticRule = this._staticRulesByString.get(string)
		if (staticRule != null) {
			log.debug(`Resolved by static rule: ${staticRule.key}`)
			const resolvedResult = { value: staticRule.resolved }
			this._resolvedResultsMap.set(string, resolvedResult)
			this.onResolved(string, 'static', resolvedResult)
			return resolvedResult
		}

		let dynamicRule: DynamicRule<T> | Nullish
		let matched: RegExpMatchArray | Nullish
		for (const rule of this.dynamicRulesMap.values()) {
			rule.stringPattern.lastIndex = 0
			matched = rule.stringPattern.exec(string)
			if (matched != null) {
				dynamicRule = rule
				break
			}
		}
		if (dynamicRule != null && matched != null) {
			const value = await dynamicRule.createResolved(matched)
			if (value == null) {
				// Retryable-unresolved: do not cache, so a later resolve call
				// re-invokes the rule (e.g. after a transient failure).
				log.debug(`Dynamic rule "${dynamicRule.key}" returned no value for "${string}", treating as unresolved (not cached)`)
				return void 0
			}
			log.debug(`Resolved by dynamic rule: ${dynamicRule.key}`)
			const resolvedResult = { value }
			this._resolvedResultsMap.set(string, resolvedResult)
			this.onResolved(string, 'dynamic', resolvedResult)
			return resolvedResult
		}

		log.debug(`Resolution failed for: ${string}`)
		// No static hit and no dynamic pattern matched at all: cache the miss so
		// repeat lookups (plain class names, raw selectors) are O(1). Never
		// reached for retryable-unresolved results, which return above.
		this._unmatchedStrings.add(string)
		return void 0
	}

	/**
	 * Updates or creates the cached resolved result for a given input string.
	 *
	 * @param string - The input string whose cached result should be updated.
	 * @param resolved - The new resolved value to store.
	 *
	 * @remarks If a cached `ResolvedResult` already exists for `string`, its `value` property is mutated in place. Otherwise a new entry is created. This allows `RecursiveResolver` to retroactively update partially resolved values without allocating a new wrapper.
	 *
	 * @example
	 * ```ts
	 * resolver._setResolvedResult('hover', ['$:hover'])
	 * ```
	 */
	_setResolvedResult(string: string, resolved: T) {
		this._unmatchedStrings.delete(string)
		const resolvedResult = this._resolvedResultsMap.get(string)
		if (resolvedResult) {
			resolvedResult.value = resolved
			return
		}

		this._resolvedResultsMap.set(string, { value: resolved })
	}
}

/**
 * Resolver subclass that recursively expands resolved values until all string references are fully resolved.
 * @internal
 *
 * @typeParam T - The element type of the final resolved array.
 *
 * @remarks Each resolution step may return a mix of final values and string references. The `resolve` method recurses into string values, flattening nested references while detecting circular dependencies via a visited set.
 *
 * @example
 * ```ts
 * class SelectorResolver extends RecursiveResolver<string> { }
 * const result = await resolver.resolve('hover-focus')
 * // ['$:hover', '$:focus'] after recursive expansion
 * ```
 */
export abstract class RecursiveResolver<T> extends AbstractResolver<T[]> {
	/**
	 * Recursively resolves an input string into a flat array of final values.
	 *
	 * @param string - The input string to resolve.
	 * @param _visited - Accumulator set for cycle detection; callers should omit this.
	 * @returns A flat array of resolved values. If no rule matches, returns `[string]` cast to `T`.
	 *
	 * @remarks Detects circular references and short-circuits by returning the unresolved string. After full expansion, the cache is updated with the final flat result via `_setResolvedResult`.
	 *
	 * @example
	 * ```ts
	 * const selectors = await resolver.resolve('hover')
	 * ```
	 */
	async resolve(string: string, _visited?: Set<string>): Promise<T[]> {
		const visited = _visited ?? new Set<string>()
		if (visited.has(string)) {
			const message = `Circular reference detected for "${string}", returning as-is`
			this.reportDiagnostic({ level: 'warning', code: 'resolver-circular-reference', message })
			log.warn(message)
			return [string as unknown as T]
		}
		visited.add(string)

		const resolved = await this._resolve(string)
			.catch((error: unknown) => {
				const message = `Failed to resolve "${string}": ${error instanceof Error ? error.message : String(error)}`
				this.reportDiagnostic({ level: 'warning', code: 'resolver-resolution-error', message, cause: error })
				log.warn(message, error)
				return void 0
			})
		if (resolved == null)
			return [string as unknown as T]

		const result: T[] = []
		for (const partial of resolved.value) {
			if (typeof partial === 'string')
				result.push(...await this.resolve(partial, new Set(visited)))
			else
				result.push(partial)
		}
		this._setResolvedResult(string, result)

		return result
	}
}

/** Discriminated normalized rule used by selector/shortcut private registries. */
export type ResolvedRuleConfig<T>
	= | { type: 'static', rule: StaticRule<T[]>, autocomplete: string[] }
		| { type: 'dynamic', rule: DynamicRule<T[]>, autocomplete: string[] }

function createDynamicResolvedFactory<T>(fn: (matched: RegExpMatchArray) => unknown) {
	return async (match: RegExpMatchArray): Promise<T[] | Nullish> => {
		const value = await fn(match)
		if (value == null)
			return value as Nullish
		return [value].flat(1) as T[]
	}
}

/**
 * Normalizes the frozen object-only selector/shortcut rule grammar.
 * Static definitions use `{ name, value }`; dynamic definitions use
 * `{ pattern, inputType, resolve, autocomplete? }`. `inputType` and rich
 * documentation metadata are semantic Typegen inputs and intentionally do not
 * affect runtime matching here.
 */
export function resolveRuleConfig<T>(config: unknown): ResolvedRuleConfig<T> | Nullish {
	if (typeof config !== 'object' || config === null || Array.isArray(config))
		return void 0

	const definition = config as Record<string, unknown>
	if (typeof definition.name === 'string' && 'value' in definition) {
		return {
			type: 'static',
			rule: {
				key: definition.name,
				string: definition.name,
				resolved: [definition.value].flat(1) as T[],
			},
			autocomplete: [definition.name],
		}
	}

	if (definition.pattern instanceof RegExp
		&& typeof definition.inputType === 'string'
		&& definition.inputType.trim().length > 0
		&& typeof definition.resolve === 'function') {
		return {
			type: 'dynamic',
			rule: {
				key: definition.pattern.source,
				stringPattern: stripGlobalFlag(definition.pattern),
				createResolved: createDynamicResolvedFactory<T>(definition.resolve as (matched: RegExpMatchArray) => unknown),
			},
			autocomplete: definition.autocomplete == null ? [] : [definition.autocomplete].flat(1) as string[],
		}
	}

	return void 0
}
