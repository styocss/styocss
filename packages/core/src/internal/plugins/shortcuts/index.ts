import { defineEnginePlugin } from '../../plugin'
import { AbstractResolver, type DynamicRule, type StaticRule } from '../../resolver'
import type { Arrayable, StyleDefinition, StyleItem } from '../../types'
import { addToSet, isNotString } from '../../utils'

type StaticShortcutRule = StaticRule<StyleItem[]>

type DynamicShortcutRule = DynamicRule<StyleItem[]>

class ShortcutResolver extends AbstractResolver<StyleItem[]> {
	resolve(shortcut: string): StyleItem[] {
		const resolved = this._resolve(shortcut)
		if (resolved == null)
			return [shortcut]

		const result = resolved.value.flatMap<StyleItem>((partial) => {
			if (typeof partial === 'string')
				return this.resolve(partial) || []

			return partial
		})
		this._setResolvedResult(shortcut, result)

		return result
	}
}

type ShortcutConfig =
	| string
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Arrayable<StyleItem>, autocomplete?: Arrayable<string>]
	| [shortcut: string, value: Arrayable<StyleItem>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Arrayable<StyleItem>
		autocomplete?: Arrayable<string>
	}
	| {
		shortcut: string
		value: Arrayable<StyleItem>
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

function resolveShortcutConfig(config: ShortcutConfig): ResolvedShortcutConfig | string {
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
					createResolved: match => [fn(match)].flat(1),
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
				createResolved: match => [fn(match)].flat(1),
			},
			autocomplete: 'autocomplete' in config ? [config.autocomplete].flat(1) : [],
		}
	}

	throw new Error('Invalid shortcut config')
}

export function shortcuts() {
	const shortcutResolver = new ShortcutResolver()
	let configList: ShortcutConfig[]
	return defineEnginePlugin({
		name: 'core:shortcuts',
		meta: {
			configKey: 'shortcuts',
		},

		config(config) {
			configList = config.shortcuts ?? []
		},
		configResolved(resolvedConfig) {
			configList.forEach((config) => {
				const resolved = resolveShortcutConfig(config)
				if (typeof resolved === 'string') {
					addToSet(resolvedConfig.autocomplete.shortcuts, resolved)
					return
				}

				if (resolved.type === 'static')
					shortcutResolver.addStaticRule(resolved.rule)
				else if (resolved.type === 'dynamic')
					shortcutResolver.addDynamicRule(resolved.rule)

				addToSet(resolvedConfig.autocomplete.selectors, ...resolved.autocomplete)
			})
		},
		transformStyleItems(styleItems) {
			return styleItems.flatMap<StyleItem>((styleItem) => {
				if (typeof styleItem === 'string')
					return shortcutResolver.resolve(styleItem)

				return styleItem
			})
		},
		transformStyleDefinitions(styleDefinitions) {
			return styleDefinitions.flatMap((styleDefinition) => {
				if ('$apply' in styleDefinition) {
					const { $apply, ...rest } = styleDefinition
					const applied = (($apply == null ? [] : [$apply].flat(1)) as string[])
						.flatMap((shortcut) => {
							const resolved: StyleDefinition[] = shortcutResolver.resolve(shortcut)
								.filter(isNotString)

							return resolved
						})
					return [...applied, rest]
				}

				return styleDefinition
			})
		},
	})
}
