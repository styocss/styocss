import type { Engine } from '../engine'
import type { Arrayable, Awaitable, Nullish, ResolvedSelector, UnionString } from '../types'
import { defineEnginePlugin } from '../plugin'
import { AbstractResolver, type DynamicRule, type StaticRule } from '../resolver'
import { warn } from '../utils'

// #region SelectorConfig
export type Selector =
	| string
	| [selector: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | ResolvedSelector>>, autocomplete?: Arrayable<string>]
	| [selector: string, value: Arrayable<UnionString | ResolvedSelector>]
	| {
		selector: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | ResolvedSelector>>
		autocomplete?: Arrayable<string>
	}
	| {
		selector: string
		value: Arrayable<UnionString | ResolvedSelector>
	}

export interface SelectorsConfig {
	/**
	 * Define custom selectors with support for dynamic and static selectors.
	 *
	 * @default []
	 * @example
	 * ```ts
	 * {
	 *   selectors: [
	 *     // Static selector
	 *     ['hover', '$:hover'],
	 *     // Dynamic selector
	 *     [/^screen-(\d+)$/, m => `@media (min-width: ${m[1]}px)`,
	 *       ['screen-768', 'screen-1024']], // Autocomplete suggestions
	 *   ]
	 * }
	 * ```
	 */
	selectors: Selector[]
}
// #endregion SelectorConfig
declare module '@pikacss/core' {
	interface EngineConfig {
		selectors?: SelectorsConfig
	}

	interface Engine {
		selectors: {
			resolver: SelectorResolver
			add: (...list: Selector[]) => void
		}
	}
}

export function selectors() {
	let engine: Engine
	let configList: Selector[]
	return defineEnginePlugin({
		name: 'core:selectors',

		rawConfigConfigured(config) {
			configList = config.selectors?.selectors ?? []
		},
		configureEngine(_engine) {
			engine = _engine
			engine.selectors = {
				resolver: new SelectorResolver(),
				add: (...list: Selector[]) => {
					list.forEach((config) => {
						const resolved = resolveSelectorConfig(config)
						if (resolved == null)
							return

						if (typeof resolved === 'string') {
							engine.appendAutocompleteSelectors(resolved)
							return
						}

						if (resolved.type === 'static')
							engine.selectors.resolver.addStaticRule(resolved.rule)
						else if (resolved.type === 'dynamic')
							engine.selectors.resolver.addDynamicRule(resolved.rule)

						engine.appendAutocompleteSelectors(...resolved.autocomplete)
					})
				},
			}

			engine.selectors.add(...configList)

			engine.selectors.resolver.onResolved = (string, type) => {
				if (type === 'dynamic') {
					engine.appendAutocompleteSelectors(string)
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

type StaticSelectorRule = StaticRule<string[]>

type DynamicSelectorRule = DynamicRule<string[]>

class SelectorResolver extends AbstractResolver<string[]> {
	async resolve(selector: string): Promise<string[]> {
		const resolved = await this._resolve(selector)
			.catch((error) => {
				warn(`Failed to resolve selector "${selector}": ${error.message}`, error)
				return void 0
			})
		if (resolved == null)
			return [selector]

		const result: string[] = []
		for (const s of resolved.value)
			result.push(...await this.resolve(s))

		this._setResolvedResult(selector, result)

		return result
	}
}

type ResolvedSelectorConfig =
	| {
		type: 'static'
		rule: StaticSelectorRule
		autocomplete: string[]
	}
	| {
		type: 'dynamic'
		rule: DynamicSelectorRule
		autocomplete: string[]
	}

export function resolveSelectorConfig(config: Selector): ResolvedSelectorConfig | string | Nullish {
	if (typeof config === 'string') {
		return config
	}
	if (Array.isArray(config)) {
		if (typeof config[0] === 'string' && typeof config[1] !== 'function') {
			return {
				type: 'static',
				rule: {
					key: config[0],
					string: config[0],
					resolved: [config[1]].flat(1),
				},
				autocomplete: [config[0]],
			}
		}

		if (config[0] instanceof RegExp && typeof config[1] === 'function') {
			const fn = config[1]
			return {
				type: 'dynamic',
				rule: {
					key: config[0].source,
					stringPattern: config[0],
					createResolved: async match => [await fn(match)].flat(1),
				},
				autocomplete: config[2] != null ? [config[2]].flat(1) : [],
			}
		}
		return void 0
	}
	if (typeof config.selector === 'string' && typeof config.value !== 'function') {
		return {
			type: 'static',
			rule: {
				key: config.selector,
				string: config.selector,
				resolved: [config.value].flat(1),
			},
			autocomplete: [config.selector],
		}
	}
	if (config.selector instanceof RegExp && typeof config.value === 'function') {
		const fn = config.value
		return {
			type: 'dynamic',
			rule: {
				key: config.selector.source,
				stringPattern: config.selector,
				createResolved: async match => [await fn(match)].flat(1),
			},
			autocomplete: ('autocomplete' in config && config.autocomplete != null)
				? [config.autocomplete].flat(1)
				: [],
		}
	}

	return void 0
}
