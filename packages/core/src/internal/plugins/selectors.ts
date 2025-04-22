import type { SelectorConfig } from '../types'
import { defineEnginePlugin } from '../plugin'
import { AbstractResolver, type DynamicRule, type StaticRule } from '../resolver'
import { appendAutocompleteSelectors } from '../utils'

type StaticSelectorRule = StaticRule<string[]>

type DynamicSelectorRule = DynamicRule<string[]>

class SelectorResolver extends AbstractResolver<string[]> {
	async resolve(selector: string): Promise<string[]> {
		const resolved = await this._resolve(selector)
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

export function resolveSelectorConfig(config: SelectorConfig): ResolvedSelectorConfig | string | undefined {
	if (typeof config === 'string') {
		return config
	}
	else if (Array.isArray(config)) {
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
	}
	else if (typeof config.selector === 'string' && typeof config.value !== 'function') {
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
	else if (config.selector instanceof RegExp && typeof config.value === 'function') {
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

export function selectors() {
	const selectorResolver = new SelectorResolver()
	let configList: SelectorConfig[]
	return defineEnginePlugin({
		name: 'core:selectors',

		beforeConfigResolving(config) {
			configList = config.selectors ?? []
		},
		configResolved(resolvedConfig) {
			configList.forEach((config) => {
				const resolved = resolveSelectorConfig(config)
				if (resolved == null)
					return

				if (typeof resolved === 'string') {
					appendAutocompleteSelectors(resolvedConfig, resolved)
					return
				}

				if (resolved.type === 'static')
					selectorResolver.addStaticRule(resolved.rule)
				else if (resolved.type === 'dynamic')
					selectorResolver.addDynamicRule(resolved.rule)

				appendAutocompleteSelectors(resolvedConfig, ...resolved.autocomplete)
			})
		},
		engineInitialized(engine) {
			selectorResolver.onResolved = (string, type) => {
				if (type === 'dynamic') {
					engine.appendAutocompleteSelectors(string)
				}
			}
		},
		async transformSelectors(selectors) {
			const result: string[] = []
			for (const selector of selectors) {
				result.push(...await selectorResolver.resolve(selector))
			}
			return result
		},
	})
}
