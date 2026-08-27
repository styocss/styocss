import type { Arrayable, Awaitable, Nullish, ResolvedSelector, UnionString } from '../types'
import { defineEnginePlugin } from '../plugin'
import { matchesRulePattern, RecursiveResolver, resolveRuleConfig } from '../resolver'
import { renderTypegenJSDoc } from '../typegen/jsdoc'

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

function renderSelectorDeclarations(definitions: readonly Selector[], onInvalidAutocomplete: (value: string, pattern: RegExp) => void): string {
	const explicit = new Map<string, string | undefined>()
	const dynamicTypes: string[] = []
	for (const definition of definitions) {
		if ('name' in definition) {
			explicit.set(definition.name, definition.description)
			continue
		}
		dynamicTypes.push(definition.inputType)
		for (const value of [definition.autocomplete ?? []].flat()) {
			if (!matchesRulePattern(definition.pattern, value)) {
				onInvalidAutocomplete(value, definition.pattern)
				continue
			}
			explicit.set(value, definition.description)
		}
	}

	const lines = ['interface __PikaExplicitSelectors {']
	for (const [name, description] of [...explicit].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
		lines.push(...renderTypegenJSDoc({ description }, {}, '  '))
		lines.push(`  ${JSON.stringify(name)}?: __StyleDefinition`)
	}
	lines.push('}')
	if (dynamicTypes.length === 0) {
		lines.push('type __PikaSelectors = __PikaExplicitSelectors')
	}
	else {
		lines.push(`type __PikaDynamicSelectorInput = ${dynamicTypes.join(' | ')}`)
		lines.push('type __PikaDynamicSelectors = { [K in __PikaDynamicSelectorInput]?: __StyleDefinition }')
		lines.push('type __PikaSelectors = __PikaExplicitSelectors & __PikaDynamicSelectors')
	}
	return lines.join('\n')
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
			const acceptedDefinitions: Selector[] = []
			for (const definition of configurator.state.definitions) {
				const resolved = resolveSelectorConfig(definition)
				if (resolved == null)
					continue
				acceptedDefinitions.push(definition)
				if (resolved.type === 'static')
					resolver.addStaticRule(resolved.rule)
				else
					resolver.addDynamicRule(resolved.rule)
			}
			configurator.state.definitions = acceptedDefinitions
			configurator.state.resolver = resolver

			const declarations = renderSelectorDeclarations(acceptedDefinitions, (value, pattern) => {
				configurator.onDiagnostic({
					level: 'warning',
					code: 'selector-autocomplete-pattern-mismatch',
					message: `Selector autocomplete value "${value}" does not match ${pattern}`,
				})
			})
			configurator.typegen.add({
				id: 'core:selectors',
				declarations,
				selectors: '__PikaSelectors',
			})
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
