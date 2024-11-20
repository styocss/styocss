import { createEventHook } from './utils'

interface ResolvedResult<T> {
	value: T
}

interface AbstractStringResolverWarnEvent {
	reason: string
	payload: Record<string, any>
}

interface AddStaticRuleWarnEvent1<StaticRule> extends AbstractStringResolverWarnEvent {
	reason: 'ADD_STATIC_RULE_ALREADY_EXISTED'
	payload: {
		addedStaticRule: StaticRule
		existedStaticRule: StaticRule
	}
}

interface AddStaticRuleWarnEvent2<StaticRule> extends AbstractStringResolverWarnEvent {
	reason: 'ADD_STATIC_RULE_CONFLICTED_WITH_STATIC_RULE'
	payload: {
		addedStaticRule: StaticRule
		conflictedStaticRule: StaticRule
	}
}

interface AddStaticRuleWarnEvent3<StaticRule, DynamicRule> extends AbstractStringResolverWarnEvent {
	reason: 'ADD_STATIC_RULE_CONFLICTED_WITH_DYNAMIC_RULE'
	payload: {
		addedStaticRule: StaticRule
		conflictedDynamicRule: DynamicRule
	}
}

interface AddDynamicRuleWarnEvent1<DynamicRule> extends AbstractStringResolverWarnEvent {
	reason: 'ADD_DYNAMIC_RULE_NOT_VALID'
	payload: {
		addedDynamicRule: DynamicRule
	}
}

interface AddDynamicRuleWarnEvent2<DynamicRule> extends AbstractStringResolverWarnEvent {
	reason: 'ADD_DYNAMIC_RULE_ALREADY_EXISTED'
	payload: {
		addedDynamicRule: DynamicRule
		existedDynamicRule: DynamicRule
	}
}

interface AddDynamicRuleWarnEvent3<StaticRule, DynamicRule> extends AbstractStringResolverWarnEvent {
	reason: 'ADD_DYNAMIC_RULE_CONFLICTED_WITH_STATIC_RULE'
	payload: {
		addedDynamicRule: DynamicRule
		conflictedStaticRule: StaticRule
	}
}

interface AddDynamicRuleWarnEvent4<DynamicRule> extends AbstractStringResolverWarnEvent {
	reason: 'ADD_DYNAMIC_RULE_CONFLICTED_WITH_DYNAMIC_RULE'
	payload: {
		addedDynamicRule: DynamicRule
		conflictedDynamicRule: DynamicRule
	}
}

type StringResolverWarnEvent<StaticRule, DynamicRule> =
	| AddStaticRuleWarnEvent1<StaticRule>
	| AddStaticRuleWarnEvent2<StaticRule>
	| AddStaticRuleWarnEvent3<StaticRule, DynamicRule>
	| AddDynamicRuleWarnEvent1<DynamicRule>
	| AddDynamicRuleWarnEvent2<DynamicRule>
	| AddDynamicRuleWarnEvent3<StaticRule, DynamicRule>
	| AddDynamicRuleWarnEvent4<DynamicRule>

interface AdaptedStaticRule<T> {
	key: string
	string: string
	resolved: T
}

interface AdaptedDynamicRule<T> {
	key: string
	stringPattern: RegExp
	predefined: string[]
	createResolved: (matched: RegExpMatchArray) => T
}

interface StringResolverOptions<T, StaticRule, DynamicRule> {
	adaptStaticRule: (rule: StaticRule) => AdaptedStaticRule<T>
	adaptDynamicRule: (rule: DynamicRule) => AdaptedDynamicRule<T>
}

export class StringResolver<T, StaticRule, DynamicRule> {
	private _options: StringResolverOptions<T, StaticRule, DynamicRule>
	private _resolvedResultsMap: Map<string, ResolvedResult<T>> = new Map()
	private _warnEventHook = createEventHook<StringResolverWarnEvent<StaticRule, DynamicRule>>()
	staticRulesMap: Map<string, StaticRule> = new Map()
	dynamicRulesMap: Map<string, DynamicRule> = new Map()

	constructor(options: StringResolverOptions<T, StaticRule, DynamicRule>) {
		this._options = options
	}

	private _adaptStaticRule(rule: StaticRule) {
		return this._options.adaptStaticRule(rule)
	}

	private _adaptDynamicRule(rule: DynamicRule) {
		return this._options.adaptDynamicRule(rule)
	}

	private _warn(event: StringResolverWarnEvent<StaticRule, DynamicRule>) {
		this._warnEventHook.trigger(event)
	}

	private _findStaticRule(key: string) {
		return this.staticRulesMap.get(key)
	}

	private _findStaticRuleByString(string: string) {
		return Array.from(this.staticRulesMap.values()).find(rule => this._adaptStaticRule(rule).string === string)
	}

	private _findDynamicRule(key: string) {
		return this.dynamicRulesMap.get(key)
	}

	private _findDynamicRuleByString(string: string) {
		return Array.from(this.dynamicRulesMap.values()).find(rule => this._adaptDynamicRule(rule).stringPattern.test(string))
	}

	private _validateDynamicRule(rule: DynamicRule) {
		return this._adaptDynamicRule(rule).predefined.every(exampleSource => this._adaptDynamicRule(rule).stringPattern.test(exampleSource))
	}

	private _findConflictedStaticRuleByDynamicRule(rule: DynamicRule) {
		return Array.from(this.staticRulesMap.values()).find(staticResolveRule => this._adaptDynamicRule(rule).stringPattern.test(this._adaptStaticRule(staticResolveRule).string))
	}

	private _findConflictedDynamicRuleByDynamicRule(rule: DynamicRule) {
		return Array.from(this.dynamicRulesMap.values())
			.find(dynamicResolveRule =>
				this._adaptDynamicRule(dynamicResolveRule).key !== this._adaptDynamicRule(rule).key
				&& this._adaptDynamicRule(dynamicResolveRule).predefined.some(
					exampleSource => this._adaptDynamicRule(rule).stringPattern.test(exampleSource),
				),
			)
	}

	onWarn(listener: (event: StringResolverWarnEvent<StaticRule, DynamicRule>) => void) {
		return this._warnEventHook.on(listener)
	}

	addStaticRule(rule: StaticRule) {
		const existedStaticRule = this._findStaticRule(this._adaptStaticRule(rule).key)
		if (existedStaticRule != null) {
			this._warn({
				reason: 'ADD_STATIC_RULE_ALREADY_EXISTED',
				payload: { addedStaticRule: rule, existedStaticRule },
			})
		}

		const conflictedStaticRule = this._findStaticRuleByString(this._adaptStaticRule(rule).string)
		if (conflictedStaticRule != null) {
			this._warn({
				reason: 'ADD_STATIC_RULE_CONFLICTED_WITH_STATIC_RULE',
				payload: { addedStaticRule: rule, conflictedStaticRule },
			})
		}

		const conflictedDynamicRule = this._findDynamicRuleByString(this._adaptStaticRule(rule).string)
		if (conflictedDynamicRule != null) {
			this._warn({
				reason: 'ADD_STATIC_RULE_CONFLICTED_WITH_DYNAMIC_RULE',
				payload: { addedStaticRule: rule, conflictedDynamicRule },
			})
		}

		this.staticRulesMap.set(this._adaptStaticRule(rule).key, rule)
		return this
	}

	removeStaticRule(key: string) {
		const staticResolveRule = this._findStaticRule(key)
		if (staticResolveRule == null)
			return this

		this.staticRulesMap.delete(key)
		this._resolvedResultsMap.delete(this._adaptStaticRule(staticResolveRule).string)
		return this
	}

	addDynamicRule(rule: DynamicRule) {
		const isValidDynamicRule = this._validateDynamicRule(rule)
		if (!isValidDynamicRule) {
			this._warn({
				reason: 'ADD_DYNAMIC_RULE_NOT_VALID',
				payload: { addedDynamicRule: rule },
			})
		}

		const existedDynamicRule = this._findDynamicRule(this._adaptDynamicRule(rule).key)
		if (existedDynamicRule != null) {
			this._warn({
				reason: 'ADD_DYNAMIC_RULE_ALREADY_EXISTED',
				payload: { addedDynamicRule: rule, existedDynamicRule },
			})
		}

		const conflictedStaticRule = this._findConflictedStaticRuleByDynamicRule(rule)
		if (conflictedStaticRule != null) {
			this._warn({
				reason: 'ADD_DYNAMIC_RULE_CONFLICTED_WITH_STATIC_RULE',
				payload: { addedDynamicRule: rule, conflictedStaticRule },
			})
		}

		const conflictedDynamicRule = this._findConflictedDynamicRuleByDynamicRule(rule)
		if (conflictedDynamicRule != null) {
			this._warn({
				reason: 'ADD_DYNAMIC_RULE_CONFLICTED_WITH_DYNAMIC_RULE',
				payload: { addedDynamicRule: rule, conflictedDynamicRule },
			})
		}

		this.dynamicRulesMap.set(this._adaptDynamicRule(rule).key, rule)
		return this
	}

	removeDynamicRule(key: string) {
		const dynamicResolveRule = this.dynamicRulesMap.get(key)
		if (dynamicResolveRule == null)
			return this

		const matchedResolvedStringList = Array.from(this._resolvedResultsMap.keys()).filter(string => this._adaptDynamicRule(dynamicResolveRule).stringPattern.test(string))
		this.dynamicRulesMap.delete(key)
		matchedResolvedStringList.forEach(string => this._resolvedResultsMap.delete(string))
		return this
	}

	resolve(string: string): ResolvedResult<T> | undefined {
		const existedResult = this._resolvedResultsMap.get(string)
		if (existedResult != null)
			return existedResult

		const staticRule = this._findStaticRuleByString(string)
		if (staticRule != null) {
			this._resolvedResultsMap.set(string, { value: this._adaptStaticRule(staticRule).resolved })
			return this.resolve(string)
		}

		let dynamicResolveRule: DynamicRule | undefined
		let matched: RegExpMatchArray | null | undefined
		for (const rule of this.dynamicRulesMap.values()) {
			matched = string.match(this._adaptDynamicRule(rule).stringPattern)
			if (matched != null) {
				dynamicResolveRule = rule
				break
			}
		}
		if (dynamicResolveRule != null && matched != null) {
			this._resolvedResultsMap.set(string, { value: this._adaptDynamicRule(dynamicResolveRule).createResolved(matched) })
			return this.resolve(string)
		}

		return undefined
	}

	setResolvedResult(string: string, resolved: T) {
		const resolvedResult = this._resolvedResultsMap.get(string)
		if (resolvedResult) {
			resolvedResult.value = resolved
			return
		}

		this._resolvedResultsMap.set(string, { value: resolved })
	}
}
