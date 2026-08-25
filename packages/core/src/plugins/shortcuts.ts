import type { Engine } from '../engine'
import type { Arrayable, Awaitable, InternalStyleDefinition, InternalStyleItem, Nullish, ResolvedStyleItem } from '../types'
import { defineEnginePlugin } from '../plugin'
import { RecursiveResolver, resolveRuleConfig } from '../resolver'
import { isNotString } from '../utils'

/**
 * User-facing shortcut rule configuration. Accepts string redirects, tuple shorthands, or object forms.
 *
 * @remarks Shortcuts expand a single name into one or more style items, allowing reusable composition of atomic styles. The configuration shapes mirror `Selector`: string redirect, `[string, value]` static, `[RegExp, fn, autocomplete?]` dynamic, or object equivalents. A dynamic rule's value function may return `undefined`/`null` to signal a retryable-unresolved result: nothing is cached and the rule is re-invoked on a later resolve call (e.g. after a transient failure).
 *
 * @example
 * ```ts
 * const rules: Shortcut[] = [
 *   ['btn', [{ padding: '0.5rem 1rem' }, { borderRadius: '0.25rem' }]],
 *   [/^btn-(.+)$/, m => ({ backgroundColor: m[1] }), 'btn-${color}'],
 * ]
 * ```
 */
export type Shortcut
	= | string
		| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<ResolvedStyleItem> | Nullish>, autocomplete?: Arrayable<string>]
		| {
			shortcut: RegExp
			value: (matched: RegExpMatchArray) => Awaitable<Arrayable<ResolvedStyleItem> | Nullish>
			autocomplete?: Arrayable<string>
		}
		| [shortcut: string, value: Arrayable<ResolvedStyleItem>]
		| {
			shortcut: string
			value: Arrayable<ResolvedStyleItem>
		}

/**
 * Configuration object for the `shortcuts` engine option.
 *
 * @remarks Passed via `EngineConfig.shortcuts` to register shortcut rules at engine creation time.
 *
 * @example
 * ```ts
 * const config: ShortcutsConfig = {
 *   definitions: [['btn', { padding: '0.5rem 1rem' }]],
 * }
 * ```
 */
export interface ShortcutsConfig {
	/** Array of shortcut rule definitions to register. */
	definitions: Shortcut[]
}

declare module '@pikacss/core' {
	interface EngineConfig {
		/**
		 * Shortcut rules configuration.
		 *
		 * @default undefined
		 */
		shortcuts?: ShortcutsConfig
	}

	interface Engine {
		/** Runtime shortcut management: resolver instance and `add` method for registering shortcuts after engine creation. */
		shortcuts: {
			resolver: ShortcutResolver
			add: (...list: Shortcut[]) => void
		}
	}
}

/**
 * Built-in engine plugin that provides the shortcut resolution system.
 *
 * @returns An `EnginePlugin` that registers the `shortcuts` resolver on the engine and hooks into `transformStyleItems` and `transformStyleDefinitions` to expand shortcut names into style items.
 *
 * @remarks Reads `EngineConfig.shortcuts` during `rawConfigConfigured`, attaches a `RecursiveResolver` to `engine.shortcuts` during `configureEngine`, and expands shortcut references in both `transformStyleItems` (string style items) and `transformStyleDefinitions` (the `__shortcut` pseudo-property).
 *
 * @example
 * ```ts
 * createEngine({ plugins: [shortcuts()] })
 * ```
 */
export function shortcuts() {
	let engine: Engine
	let configList: Shortcut[]
	return defineEnginePlugin({
		name: 'core:shortcuts',

		rawConfigConfigured(config) {
			configList = config.shortcuts?.definitions ?? []
		},
		configureEngine(configurator) {
			engine = configurator.runtime
			engine.shortcuts = {
				resolver: new ShortcutResolver(engine.onDiagnostic),
				add: (...list) => {
					list.forEach((config) => {
						const resolved = resolveShortcutConfig(config)
						if (resolved == null)
							return

						if (typeof resolved === 'string') {
							engine.appendAutocomplete({ shortcuts: resolved })
							return
						}

						if (resolved.type === 'static')
							engine.shortcuts.resolver.addStaticRule(resolved.rule)
						else
							engine.shortcuts.resolver.addDynamicRule(resolved.rule)

						engine.appendAutocomplete({ shortcuts: resolved.autocomplete })
					})
				},
			}

			engine.shortcuts.add(...configList)

			engine.shortcuts.resolver.onResolved = (string, type) => {
				if (type === 'dynamic') {
					engine.appendAutocomplete({ shortcuts: string })
				}
			}

			const unionType = ['(string & {})', 'Autocomplete[\'Shortcut\']'].join(' | ')
			engine.appendAutocomplete({
				extraProperties: '__shortcut',
				properties: {
					__shortcut: [unionType, `(${unionType})[]`],
				},
			})
		},
		async transformStyleItems(styleItems) {
			const result: InternalStyleItem[] = []
			for (const styleItem of styleItems) {
				if (typeof styleItem === 'string') {
					result.push(...await engine.shortcuts.resolver.resolve(styleItem))
					continue
				}

				result.push(styleItem)
			}
			return result
		},
		async transformStyleDefinitions(styleDefinitions) {
			const result: InternalStyleDefinition[] = []
			for (const styleDefinition of styleDefinitions) {
				if ('__shortcut' in styleDefinition) {
					const { __shortcut, ...rest } = styleDefinition as InternalStyleDefinition & { __shortcut?: unknown, __important?: boolean | null }
					// Propagate an explicitly set `__important` flag onto the expanded
					// definitions so the important plugin (which runs after shortcut
					// expansion) treats them like the original call. An expanded
					// definition's own explicit flag still wins.
					const explicitImportant = rest.__important ?? null
					const applied: InternalStyleDefinition[] = []
					for (const shortcut of ((__shortcut == null ? [] : [__shortcut].flat(1)) as string[])) {
						const resolved: InternalStyleDefinition[] = (await engine.shortcuts.resolver.resolve(shortcut)).filter(isNotString)
						applied.push(...(explicitImportant == null
							? resolved
							: resolved.map(definition => ({ __important: explicitImportant, ...definition } as unknown as InternalStyleDefinition))))
					}
					result.push(...applied, rest)
				}
				else {
					result.push(styleDefinition)
				}
			}
			return result
		},
	})
}

class ShortcutResolver extends RecursiveResolver<InternalStyleItem> {}

function resolveShortcutConfig(config: Shortcut) {
	return resolveRuleConfig<InternalStyleItem>(config, 'shortcut')
}
