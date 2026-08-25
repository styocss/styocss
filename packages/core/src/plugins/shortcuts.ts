import type { Arrayable, Awaitable, InternalStyleItem, Nullish, ResolvedStyleItem } from '../types'
import { defineEnginePlugin } from '../plugin'
import { RecursiveResolver, resolveRuleConfig } from '../resolver'

/** Static shortcut definition in the frozen object-only authoring grammar. */
export interface StaticShortcut {
	name: string
	value: Arrayable<ResolvedStyleItem>
	description?: string
}

/** Dynamic shortcut definition with separate runtime and TypeScript input contracts. */
export interface DynamicShortcut {
	pattern: RegExp
	inputType: string
	resolve: (matched: RegExpMatchArray) => Awaitable<Arrayable<ResolvedStyleItem> | Nullish>
	autocomplete?: Arrayable<string>
	description?: string
}

/** User-facing shortcut definition. Tuple/string shorthand forms are intentionally unsupported. */
export type Shortcut = StaticShortcut | DynamicShortcut

export interface ShortcutsConfig {
	definitions: Shortcut[]
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/** Shortcut definitions consumed once during Engine initialization. */
		shortcuts?: ShortcutsConfig
	}
}

interface ShortcutsState {
	definitions: Shortcut[]
	resolver?: ShortcutResolver
}

/** Built-in shortcut subsystem. Effective raw config is its only semantic ingress. */
export function shortcuts() {
	return defineEnginePlugin({
		name: 'core:shortcuts',
		createState: (): ShortcutsState => ({ definitions: [] }),
		rawConfigConfigured(config, context) {
			context.state.definitions = config.shortcuts?.definitions ?? []
		},
		configureEngine(configurator) {
			const resolver = new ShortcutResolver(configurator.onDiagnostic)
			for (const definition of configurator.state.definitions) {
				const resolved = resolveShortcutConfig(definition)
				if (resolved == null)
					continue
				if (resolved.type === 'static')
					resolver.addStaticRule(resolved.rule)
				else
					resolver.addDynamicRule(resolved.rule)
			}
			configurator.state.resolver = resolver
		},
		async transformStyleItems(styleItems, context) {
			const resolver = context.state.resolver
			if (resolver == null)
				return styleItems
			const result: InternalStyleItem[] = []
			for (const styleItem of styleItems) {
				if (typeof styleItem === 'string') {
					result.push(...await resolver.resolve(styleItem))
					continue
				}
				result.push(styleItem)
			}
			return result
		},
	})
}

class ShortcutResolver extends RecursiveResolver<InternalStyleItem> {}

/** @internal */
export function resolveShortcutConfig(config: Shortcut) {
	return resolveRuleConfig<InternalStyleItem>(config)
}
