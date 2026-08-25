import type { Arrayable, Awaitable, InternalStyleItem, Nullish, ResolvedStyleItem } from '../types'
import { defineEnginePlugin } from '../plugin'
import { matchesRulePattern, RecursiveResolver, resolveRuleConfig } from '../resolver'
import { renderTypegenJSDoc } from '../typegen/jsdoc'

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

function createStrictShortcutNamespace(definitions: readonly Shortcut[]): object {
	const staticNames = new Set(definitions.flatMap(definition => 'name' in definition ? [definition.name] : []))
	const dynamicPatterns = definitions.flatMap(definition => 'pattern' in definition ? [definition.pattern] : [])
	return new Proxy(Object.create(null) as Record<string, string>, {
		get(_target, property) {
			if (typeof property !== 'string')
				return undefined
			return staticNames.has(property) || dynamicPatterns.some(pattern => matchesRulePattern(pattern, property))
				? property
				: undefined
		},
	})
}

function renderShortcutDeclarations(definitions: readonly Shortcut[], onInvalidAutocomplete: (value: string, pattern: RegExp) => void): string {
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

	const lines = ['interface __PikaExplicitShortcuts {']
	for (const [name, description] of [...explicit].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
		lines.push(...renderTypegenJSDoc({ description }, {}, '  '))
		lines.push(`  ${JSON.stringify(name)}: string`)
	}
	lines.push('}')
	if (dynamicTypes.length === 0) {
		lines.push('type __PikaShortcuts = __PikaExplicitShortcuts')
	}
	else {
		lines.push(`type __PikaDynamicShortcutInput = ${dynamicTypes.join(' | ')}`)
		lines.push('type __PikaDynamicShortcuts = { [K in __PikaDynamicShortcutInput]: string }')
		lines.push('type __PikaShortcuts = __PikaExplicitShortcuts & __PikaDynamicShortcuts')
	}
	return lines.join('\n')
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
			const acceptedDefinitions: Shortcut[] = []
			for (const definition of configurator.state.definitions) {
				const resolved = resolveShortcutConfig(definition)
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

			configurator.pika.extendStatic('sc', createStrictShortcutNamespace(acceptedDefinitions))
			const declarations = renderShortcutDeclarations(acceptedDefinitions, (value, pattern) => {
				configurator.onDiagnostic({
					level: 'warning',
					code: 'shortcut-autocomplete-pattern-mismatch',
					message: `Shortcut autocomplete value "${value}" does not match ${pattern}`,
				})
			})
			configurator.typegen.add({
				id: 'core:shortcuts',
				declarations,
				pika: { sc: '__PikaShortcuts' },
			})
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
