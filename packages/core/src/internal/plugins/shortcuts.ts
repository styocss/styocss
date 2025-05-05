import type { Engine } from '../engine'
import type { Arrayable, Awaitable, Nullish, ResolvedStyleItem, StyleDefinition, StyleItem } from '../types'
import { defineEnginePlugin } from '../plugin'
import { AbstractResolver, type DynamicRule, type StaticRule } from '../resolver'
import { isNotString, warn } from '../utils'

export type ShortcutConfig =
	| string
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Awaitable<Arrayable<ResolvedStyleItem>>, autocomplete?: Arrayable<string>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Awaitable<Arrayable<ResolvedStyleItem>>
		autocomplete?: Arrayable<string>
	}
	| [shortcut: string, value: Arrayable<ResolvedStyleItem>]
	| {
		shortcut: string
		value: Arrayable<ResolvedStyleItem>
	}

declare module '@pikacss/core' {
	interface EngineConfig {
		shortcuts?: {
			/**
			 * Define style shortcuts for reusable style combinations.
			 *
			 * @default []
			 * @example
			 * ```ts
			 * {
			 *   shortcuts: [
			 *     // Static shortcut
			 *     ['flex-center', {
			 *       display: 'flex',
			 *       alignItems: 'center',
			 *       justifyContent: 'center'
			 *     }],
			 *     // Dynamic shortcut
			 *     [/^m-(\d+)$/, m => ({ margin: `${m[1]}px` }),
			 *       ['m-4', 'm-8']] // Autocomplete suggestions
			 *   ]
			 * }
			 * ```
			 */
			shortcuts: ShortcutConfig[]
		}
	}

	interface EngineExtraProperties {
		shortcuts: {
			resolver: ShortcutResolver
			add: (...list: ShortcutConfig[]) => void
		}
	}
}

export function shortcuts() {
	let engine: Engine
	let configList: ShortcutConfig[]
	return defineEnginePlugin({
		name: 'core:shortcuts',

		rawConfigConfigured(config) {
			configList = config.shortcuts?.shortcuts ?? []
		},
		configureEngine(_engine) {
			engine = _engine
			engine.extra.shortcuts = {
				resolver: new ShortcutResolver(),
				add: (...list) => {
					list.forEach((config) => {
						const resolved = resolveShortcutConfig(config)
						if (resolved == null)
							return

						if (typeof resolved === 'string') {
							engine.appendAutocompleteStyleItemStrings(resolved)
							return
						}

						if (resolved.type === 'static')
							engine.extra.shortcuts.resolver.addStaticRule(resolved.rule)
						else if (resolved.type === 'dynamic')
							engine.extra.shortcuts.resolver.addDynamicRule(resolved.rule)

						engine.appendAutocompleteStyleItemStrings(...resolved.autocomplete)
					})
				},
			}

			engine.extra.shortcuts.add(...configList)

			engine.extra.shortcuts.resolver.onResolved = (string, type) => {
				if (type === 'dynamic') {
					engine.appendAutocompleteStyleItemStrings(string)
				}
			}

			engine.appendAutocompleteExtraProperties('__shortcut')
			const unionType = ['(string & {})', 'Autocomplete[\'StyleItemString\']'].join(' | ')
			engine.appendAutocompletePropertyValues('__shortcut', unionType, `(${unionType})[]`)
		},
		async transformStyleItems(styleItems) {
			const result: StyleItem[] = []
			for (const styleItem of styleItems) {
				if (typeof styleItem === 'string') {
					result.push(...await engine.extra.shortcuts.resolver.resolve(styleItem))
					continue
				}

				result.push(styleItem)
			}
			return result
		},
		async transformStyleDefinitions(styleDefinitions) {
			const result: StyleDefinition[] = []
			for (const styleDefinition of styleDefinitions) {
				if ('__shortcut' in styleDefinition) {
					const { __shortcut, ...rest } = styleDefinition
					const applied: StyleDefinition[] = []
					for (const shortcut of ((__shortcut == null ? [] : [__shortcut].flat(1)) as string[])) {
						const resolved: StyleDefinition[] = (await engine.extra.shortcuts.resolver.resolve(shortcut)).filter(isNotString)
						applied.push(...resolved)
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

type StaticShortcutRule = StaticRule<StyleItem[]>

type DynamicShortcutRule = DynamicRule<StyleItem[]>

class ShortcutResolver extends AbstractResolver<StyleItem[]> {
	async resolve(shortcut: string): Promise<StyleItem[]> {
		const resolved = await this._resolve(shortcut)
			.catch((error) => {
				warn(`Failed to resolve shortcut "${shortcut}": ${error.message}`, error)
				return void 0
			})
		if (resolved == null)
			return [shortcut]

		const result: StyleItem[] = []
		for (const partial of resolved.value) {
			if (typeof partial === 'string')
				result.push(...await this.resolve(partial))
			else
				result.push(partial)
		}
		this._setResolvedResult(shortcut, result)

		return result
	}
}

type ResolvedShortcutConfig =
	| {
		type: 'static'
		rule: StaticShortcutRule
		autocomplete: string[]
	}
	| {
		type: 'dynamic'
		rule: DynamicShortcutRule
		autocomplete: string[]
	}

function resolveShortcutConfig(config: ShortcutConfig): ResolvedShortcutConfig | string | Nullish {
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
	else if (typeof config.shortcut === 'string' && typeof config.value !== 'function') {
		return {
			type: 'static',
			rule: {
				key: config.shortcut,
				string: config.shortcut,
				resolved: [config.value].flat(1),
			},
			autocomplete: [config.shortcut],
		}
	}
	else if (config.shortcut instanceof RegExp && typeof config.value === 'function') {
		const fn = config.value
		return {
			type: 'dynamic',
			rule: {
				key: config.shortcut.source,
				stringPattern: config.shortcut,
				createResolved: async match => [await fn(match)].flat(1),
			},
			autocomplete: ('autocomplete' in config && config.autocomplete != null)
				? [config.autocomplete].flat(1)
				: [],
		}
	}

	return void 0
}
