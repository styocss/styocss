import type { Arrayable, Awaitable, Nullish, ResolvedSelector, UnionString } from '../types'
import { defineEnginePlugin } from '../plugin'
import { RecursiveResolver, resolveRuleConfig } from '../resolver'

/** Static selector definition in the frozen object-only authoring grammar. */
export interface StaticSelector {
	name: string
	value: Arrayable<UnionString | ResolvedSelector>
	description?: string
}

/** Dynamic selector definition with separate runtime and TypeScript input contracts. */
export interface DynamicSelector {
	pattern: RegExp
	inputType: string
	resolve: (matched: RegExpMatchArray) => Awaitable<Arrayable<UnionString | ResolvedSelector> | Nullish>
	autocomplete?: Arrayable<string>
	description?: string
}

/** User-facing selector definition. Tuple/string shorthand forms are intentionally unsupported. */
export type Selector = StaticSelector | DynamicSelector

export interface SelectorsConfig {
	definitions: Selector[]
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/** Selector definitions consumed once during Engine initialization. */
		selectors?: SelectorsConfig
	}
}

interface SelectorsState {
	definitions: Selector[]
	resolver?: SelectorResolver
}

/** Built-in selector subsystem. Effective raw config is its only semantic ingress. */
export function selectors() {
	return defineEnginePlugin({
		name: 'core:selectors',
		createState: (): SelectorsState => ({ definitions: [] }),
		rawConfigConfigured(config, context) {
			context.state.definitions = config.selectors?.definitions ?? []
		},
		configureEngine(configurator) {
			const resolver = new SelectorResolver(configurator.onDiagnostic)
			for (const definition of configurator.state.definitions) {
				const resolved = resolveSelectorConfig(definition)
				if (resolved == null)
					continue
				if (resolved.type === 'static')
					resolver.addStaticRule(resolved.rule)
				else
					resolver.addDynamicRule(resolved.rule)
			}
			configurator.state.resolver = resolver
		},
		async transformSelectors(selectors, context) {
			const resolver = context.state.resolver
			if (resolver == null)
				return selectors
			const result: string[] = []
			for (const selector of selectors)
				result.push(...await resolver.resolve(selector))
			return result
		},
	})
}

class SelectorResolver extends RecursiveResolver<string> {}

/** @internal */
export function resolveSelectorConfig(config: Selector) {
	return resolveRuleConfig<string>(config)
}
