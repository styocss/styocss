import type { Arrayable, StyleItem } from './types'

// AbstractResolver
interface ResolvedResult<T> {
	value: T
}

interface StaticRule<T> {
	key: string
	string: string
	resolved: T
}

interface DynamicRule<T> {
	key: string
	stringPattern: RegExp
	predefined: string[]
	createResolved: (matched: RegExpMatchArray) => T
}

abstract class AbstractResolver<T> {
	private _resolvedResultsMap: Map<string, ResolvedResult<T>> = new Map()
	staticRulesMap: Map<string, StaticRule<T>> = new Map()
	dynamicRulesMap: Map<string, DynamicRule<T>> = new Map()

	get staticRules() {
		return [...this.staticRulesMap.values()]
	}

	get dynamicRules() {
		return [...this.dynamicRulesMap.values()]
	}

	addStaticRule(rule: StaticRule<T>) {
		this.staticRulesMap.set(rule.key, rule)
		return this
	}

	removeStaticRule(key: string) {
		const rule = this.staticRulesMap.get(key)
		if (rule == null)
			return this

		this.staticRulesMap.delete(key)
		this._resolvedResultsMap.delete(rule.string)
		return this
	}

	addDynamicRule(rule: DynamicRule<T>) {
		this.dynamicRulesMap.set(rule.key, rule)
		return this
	}

	removeDynamicRule(key: string) {
		const rule = this.dynamicRulesMap.get(key)
		if (rule == null)
			return this

		const matchedResolvedStringList = Array.from(this._resolvedResultsMap.keys())
			.filter(string => rule.stringPattern.test(string))
		this.dynamicRulesMap.delete(key)
		matchedResolvedStringList.forEach(string => this._resolvedResultsMap.delete(string))
		return this
	}

	_resolve(string: string): ResolvedResult<T> | undefined {
		const existedResult = this._resolvedResultsMap.get(string)
		if (existedResult != null)
			return existedResult

		const staticRule = Array.from(this.staticRulesMap.values()).find(rule => rule.string === string)
		if (staticRule != null) {
			this._resolvedResultsMap.set(string, { value: staticRule.resolved })
			return this._resolve(string)
		}

		let dynamicRule: DynamicRule<T> | undefined
		let matched: RegExpMatchArray | null | undefined
		for (const rule of this.dynamicRulesMap.values()) {
			matched = string.match(rule.stringPattern)
			if (matched != null) {
				dynamicRule = rule
				break
			}
		}
		if (dynamicRule != null && matched != null) {
			this._resolvedResultsMap.set(string, { value: dynamicRule.createResolved(matched) })
			return this._resolve(string)
		}

		return undefined
	}

	_setResolvedResult(string: string, resolved: T) {
		const resolvedResult = this._resolvedResultsMap.get(string)
		if (resolvedResult) {
			resolvedResult.value = resolved
			return
		}

		this._resolvedResultsMap.set(string, { value: resolved })
	}
}

// SelectorResolver
export type SelectorConfig =
	| [selector: string, value: Arrayable<string>]
	| {
		selector: string
		value: Arrayable<string>
	}
	| {
		selector: RegExp
		value: (matched: RegExpMatchArray) => Arrayable<string>
		predefined?: Arrayable<string>
	}

export type StaticSelectorRule = StaticRule<string[]>

export type DynamicSelectorRule = DynamicRule<string[]>

export function resolveSelectorConfigs(configs: SelectorConfig[]) {
	const resolved = {
		static: [] as StaticSelectorRule[],
		dynamic: [] as DynamicSelectorRule[],
	}

	configs.forEach((c) => {
		if (Array.isArray(c)) {
			resolved.static.push({
				key: c[0],
				string: c[0],
				resolved: [c[1]].flat(1),
			})
		}
		else if (typeof c.selector === 'string' && typeof c.value !== 'function') {
			resolved.static.push({
				key: c.selector,
				string: c.selector,
				resolved: [c.value].flat(1),
			})
		}
		else if (c.selector instanceof RegExp && typeof c.value === 'function') {
			const fn = c.value
			resolved.dynamic.push({
				key: c.selector.source,
				stringPattern: c.selector,
				createResolved: match => [fn(match)].flat(1),
				predefined: 'predefined' in c ? [c.predefined].flat(1) : [],
			})
		}
	})

	return resolved
}

export class SelectorResolver extends AbstractResolver<string[]> {
	resolve(selector: string): string[] {
		const resolved = this._resolve(selector)
		if (resolved == null)
			return [selector]

		const result = resolved.value.flatMap(s => this.resolve(s))
		this._setResolvedResult(selector, result)

		return result
	}
}

// ShortcutResolver
export type ShortcutPartial = StyleItem

export type ShortcutConfig =
	| [shortcut: string, value: Arrayable<ShortcutPartial>]
	| {
		shortcut: string
		value: Arrayable<ShortcutPartial>
	}
	| {
		shortcut: RegExp
		value: (matched: RegExpMatchArray) => Arrayable<ShortcutPartial>
		predefined?: Arrayable<string>
	}

export type StaticShortcutRule = StaticRule<ShortcutPartial[]>

export type DynamicShortcutRule = DynamicRule<ShortcutPartial[]>

export function resolveShortcutConfigs(configs: ShortcutConfig[]) {
	const resolved = {
		static: [] as StaticShortcutRule[],
		dynamic: [] as DynamicShortcutRule[],
	}

	configs.forEach((c) => {
		if (Array.isArray(c)) {
			resolved.static.push({
				key: c[0],
				string: c[0],
				resolved: [c[1]].flat(1),
			})
		}
		else if (typeof c.shortcut === 'string' && typeof c.value !== 'function') {
			resolved.static.push({
				key: c.shortcut,
				string: c.shortcut,
				resolved: [c.value].flat(1),
			})
		}
		else if (c.shortcut instanceof RegExp && typeof c.value === 'function') {
			const fn = c.value
			resolved.dynamic.push({
				key: c.shortcut.source,
				stringPattern: c.shortcut,
				createResolved: match => [fn(match)].flat(1),
				predefined: 'predefined' in c ? [c.predefined].flat(1) : [],
			})
		}
	})

	return resolved
}

export class ShortcutResolver extends AbstractResolver<ShortcutPartial[]> {
	resolve(shortcut: string): ShortcutPartial[] {
		const resolved = this._resolve(shortcut)
		if (resolved == null)
			return [shortcut]

		const result = resolved.value.flatMap((partial) => {
			if (typeof partial === 'string')
				return this.resolve(partial) || []

			return partial
		})
		this._setResolvedResult(shortcut, result)

		return result
	}
}
