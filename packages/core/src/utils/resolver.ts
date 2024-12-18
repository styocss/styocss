import type { Awaitable } from '../types'

export interface ResolvedResult<T> {
	value: T
}

export interface StaticRule<T> {
	key: string
	string: string
	resolved: T
}

export interface DynamicRule<T> {
	key: string
	stringPattern: RegExp
	createResolved: (matched: RegExpMatchArray) => Awaitable<T>
}

export abstract class AbstractResolver<T> {
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

	async _resolve(string: string): Promise<ResolvedResult<T> | undefined> {
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
			this._resolvedResultsMap.set(string, { value: await dynamicRule.createResolved(matched) })
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
