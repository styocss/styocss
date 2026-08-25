import type { Engine } from '../engine'
import type { Arrayable, Awaitable, Nullish, ResolvedSelector, UnionString } from '../types'
import { defineEnginePlugin } from '../plugin'
import { RecursiveResolver, resolveRuleConfig } from '../resolver'

/**
 * User-facing selector rule configuration. Accepts string redirects, tuple shorthands, or object forms.
 *
 * @remarks
 * - **String**: a redirect to another named selector.
 * - **Tuple `[string, value]`**: a static rule mapping an exact selector name to one or more resolved CSS selectors.
 * - **Tuple `[RegExp, fn, autocomplete?]`**: a dynamic rule matching a pattern and lazily computing resolved CSS selectors.
 * - **Object `{ selector, value, autocomplete? }`**: an explicit form of either static or dynamic rule.
 *
 * A dynamic rule's value function may return `undefined`/`null` to signal a retryable-unresolved result: nothing is cached and the rule is re-invoked on a later resolve call (e.g. after a transient failure).
 *
 * @example
 * ```ts
 * const rules: Selector[] = [
 *   ['hover', '$:hover'],
 *   [/^media-(\d+)$/, m => `@media (min-width: ${m[1]}px)`, 'media-${breakpoint}'],
 * ]
 * ```
 */
export type Selector
	= | string
		| [selector: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | ResolvedSelector> | Nullish>, autocomplete?: Arrayable<string>]
		| [selector: string, value: Arrayable<UnionString | ResolvedSelector>]
		| {
			selector: RegExp
			value: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | ResolvedSelector> | Nullish>
			autocomplete?: Arrayable<string>
		}
		| {
			selector: string
			value: Arrayable<UnionString | ResolvedSelector>
		}

/**
 * Configuration object for the `selectors` engine option.
 *
 * @remarks Passed via `EngineConfig.selectors` to register selector rules at engine creation time.
 *
 * @example
 * ```ts
 * const config: SelectorsConfig = {
 *   definitions: [['hover', '$:hover'], ['focus', '$:focus']],
 * }
 * ```
 */
export interface SelectorsConfig {
	/** Array of selector rule definitions to register. */
	definitions: Selector[]
}
declare module '@pikacss/core' {
	interface EngineConfig {
		/**
		 * Selector rules configuration.
		 *
		 * @default undefined
		 */
		selectors?: SelectorsConfig
	}

	interface Engine {
		/** Runtime selector management: resolver instance and `add` method for registering selectors after engine creation. */
		selectors: {
			resolver: SelectorResolver
			add: (...list: Selector[]) => void
		}
	}
}

/**
 * Built-in engine plugin that provides the selector resolution system.
 *
 * @returns An `EnginePlugin` that registers the `selectors` resolver on the engine and hooks into `transformSelectors` to expand selector names into resolved CSS selectors.
 *
 * @remarks Reads `EngineConfig.selectors` during `rawConfigConfigured`, attaches a `RecursiveResolver` to `engine.selectors` during `configureEngine`, and resolves all selector strings in the `transformSelectors` hook.
 *
 * @example
 * ```ts
 * createEngine({ plugins: [selectors()] })
 * ```
 */
export function selectors() {
	let engine: Engine
	let configList: Selector[]
	return defineEnginePlugin({
		name: 'core:selectors',

		rawConfigConfigured(config) {
			configList = config.selectors?.definitions ?? []
		},
		configureEngine(configurator) {
			engine = configurator.runtime
			engine.selectors = {
				resolver: new SelectorResolver(engine.onDiagnostic),
				add: (...list: Selector[]) => {
					list.forEach((config) => {
						const resolved = resolveSelectorConfig(config)
						if (resolved == null)
							return

						if (typeof resolved === 'string') {
							engine.appendAutocomplete({ selectors: resolved })
							return
						}

						if (resolved.type === 'static')
							engine.selectors.resolver.addStaticRule(resolved.rule)
						else
							engine.selectors.resolver.addDynamicRule(resolved.rule)

						engine.appendAutocomplete({ selectors: resolved.autocomplete })
					})
				},
			}

			engine.selectors.add(...configList)

			engine.selectors.resolver.onResolved = (string, type) => {
				if (type === 'dynamic') {
					engine.appendAutocomplete({ selectors: string })
				}
			}
		},
		async transformSelectors(selectors) {
			const result: string[] = []
			for (const selector of selectors) {
				result.push(...await engine.selectors.resolver.resolve(selector))
			}
			return result
		},
	})
}

class SelectorResolver extends RecursiveResolver<string> {}

/**
 * Normalizes a `Selector` configuration into a `ResolvedRuleConfig`, a redirect string, or `undefined`.
 *
 * @param config - The selector rule configuration to resolve.
 * @returns A resolved static/dynamic rule config, a redirect string, or `undefined` if the shape is unrecognized.
 *
 * @remarks Delegates to the generic `resolveRuleConfig` with `'selector'` as the key name.
 *
 * @example
 * ```ts
 * const resolved = resolveSelectorConfig(['hover', '$:hover'])
 * ```
 */
export function resolveSelectorConfig(config: Selector) {
	return resolveRuleConfig<string>(config, 'selector')
}
