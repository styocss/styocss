import { appendAutocompleteExtraProperties, appendAutocompletePropertyValues, appendAutocompleteStyleItemStrings, defineEnginePlugin } from '../../helpers'
import { AbstractResolver, type DynamicRule, type StaticRule } from '../../utils'
import type { Arrayable, _StyleDefinition, _StyleItem } from '../../types'
import type { StyleItem } from '../../detailedTypes'
import { addToSet, isNotString } from '../../utils'

type StaticShortcutRule = StaticRule<_StyleItem[]>

type DynamicShortcutRule = DynamicRule<_StyleItem[]>

class ShortcutResolver extends AbstractResolver<_StyleItem[]> {
	async resolve(shortcut: string): Promise<_StyleItem[]> {
		const resolved = await this._resolve(shortcut)
		if (resolved == null)
			return [shortcut]

		const result: _StyleItem[] = []
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

export type ShortcutConfig =
	| string
	| [shortcut: RegExp, value: (matched: RegExpMatchArray) => Arrayable<StyleItem>, autocomplete?: Arrayable<string>]
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Arrayable<StyleItem>
		autocomplete?: Arrayable<string>
	}
	| [shortcut: string, value: Arrayable<StyleItem>]
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
	return defineEnginePlugin([
		{
			name: 'core:shortcuts:post',
			enforce: 'post',
			config(config) {
				configList = config.shortcuts ?? []
			},
			configResolved(resolvedConfig) {
				const autocompleteShortcuts = new Set<string>()
				configList.forEach((config) => {
					const resolved = resolveShortcutConfig(config)
					if (typeof resolved === 'string') {
						addToSet(autocompleteShortcuts, resolved)
						return
					}

					if (resolved.type === 'static')
						shortcutResolver.addStaticRule(resolved.rule)
					else if (resolved.type === 'dynamic')
						shortcutResolver.addDynamicRule(resolved.rule)

					addToSet(autocompleteShortcuts, ...resolved.autocomplete)
				})
				appendAutocompleteStyleItemStrings(resolvedConfig, ...autocompleteShortcuts)
				appendAutocompleteExtraProperties(resolvedConfig, '$apply')
				const unionType = [...autocompleteShortcuts].map(s => `'${s}'`).join(' | ')
				appendAutocompletePropertyValues(resolvedConfig, '$apply', unionType, `((${unionType})[])`)
			},
		},
		{
			name: 'core:shortcuts:transform',
			async transformStyleItems(styleItems) {
				const result: _StyleItem[] = []
				for (const styleItem of styleItems) {
					if (typeof styleItem === 'string')
						result.push(...await shortcutResolver.resolve(styleItem))

					result.push(styleItem)
				}
				return result
			},
			async transformStyleDefinitions(styleDefinitions) {
				const result: _StyleDefinition[] = []
				for (const styleDefinition of styleDefinitions) {
					if ('$apply' in styleDefinition) {
						const { $apply, ...rest } = styleDefinition
						const applied: _StyleDefinition[] = []
						for (const shortcut of (($apply == null ? [] : [$apply].flat(1)) as string[])) {
							const resolved: _StyleDefinition[] = (await shortcutResolver.resolve(shortcut)).filter(isNotString)
							applied.push(...resolved)
						}
						result.push(...applied, rest)
					}

					result.push(styleDefinition)
				}
				return result
			},
		},
	])
}
