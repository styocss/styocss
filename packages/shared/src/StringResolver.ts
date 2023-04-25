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

interface StringResolverOptions<T, StaticRule, DynamicRule> {
  getStaticRuleKey: (rule: StaticRule) => string
  getDynamicRuleKey: (rule: DynamicRule) => string
  getStaticRuleString: (rule: StaticRule) => string
  getStaticRuleResolved: (rule: StaticRule) => T
  getDynamicRuleStringPattern: (rule: DynamicRule) => RegExp
  getDynamicRuleExampleList: (rule: DynamicRule) => string[]
  getDynamicRuleCreateResolved: (rule: DynamicRule) => (matched: RegExpMatchArray) => T
}

export class StringResolver<T, StaticRule, DynamicRule> {
  _options: StringResolverOptions<T, StaticRule, DynamicRule>
  _resolvedResultsMap: Map<string, ResolvedResult<T>> = new Map()
  _warnEventHook = createEventHook<StringResolverWarnEvent<StaticRule, DynamicRule>>()
  staticResolveRulesMap: Map<string, StaticRule> = new Map()
  dynamicResolveRulesMap: Map<string, DynamicRule> = new Map()

  constructor (options: StringResolverOptions<T, StaticRule, DynamicRule>) {
    this._options = options
  }

  _getStaticRuleKey (rule: StaticRule) {
    return this._options.getStaticRuleKey(rule)
  }

  _getDynamicRuleKey (rule: DynamicRule) {
    return this._options.getDynamicRuleKey(rule)
  }

  _getStaticRuleString (rule: StaticRule) {
    return this._options.getStaticRuleString(rule)
  }

  _getStaticRuleResolved (rule: StaticRule) {
    return this._options.getStaticRuleResolved(rule)
  }

  _getDynamicRuleStringPattern (rule: DynamicRule) {
    return this._options.getDynamicRuleStringPattern(rule)
  }

  _getDynamicRuleExampleList (rule: DynamicRule) {
    return this._options.getDynamicRuleExampleList(rule)
  }

  _getDynamicRuleCreateResolved (rule: DynamicRule) {
    return this._options.getDynamicRuleCreateResolved(rule)
  }

  _warn (event: StringResolverWarnEvent<StaticRule, DynamicRule>) {
    this._warnEventHook.trigger(event)
  }

  _findStaticRule (key: string) {
    return this.staticResolveRulesMap.get(key)
  }

  _findStaticRuleByString (string_: string) {
    return Array.from(this.staticResolveRulesMap.values()).find((rule) => this._getStaticRuleString(rule) === string_)
  }

  _findDynamicRule (key: string) {
    return this.dynamicResolveRulesMap.get(key)
  }

  _findDynamicRuleByString (string_: string) {
    return Array.from(this.dynamicResolveRulesMap.values()).find((rule) => this._getDynamicRuleStringPattern(rule).test(string_))
  }

  _validateDynamicRule (rule: DynamicRule) {
    return this._getDynamicRuleExampleList(rule).every((exampleSource) => this._getDynamicRuleStringPattern(rule).test(exampleSource))
  }

  _findConflictedStaticRuleByDynamicRule (rule: DynamicRule) {
    return Array.from(this.staticResolveRulesMap.values()).find((staticResolveRule) => this._getDynamicRuleStringPattern(rule).test(this._getStaticRuleString(staticResolveRule)))
  }

  _findConflictedDynamicRuleByDynamicRule (rule: DynamicRule) {
    return Array.from(this.dynamicResolveRulesMap.values())
      .find((dynamicResolveRule) =>
        this._getDynamicRuleKey(dynamicResolveRule) !== this._getDynamicRuleKey(rule)
        && this._getDynamicRuleExampleList(dynamicResolveRule).some(
          (exampleSource) => this._getDynamicRuleStringPattern(rule).test(exampleSource),
        ),
      )
  }

  onWarn (listener: (event: StringResolverWarnEvent<StaticRule, DynamicRule>) => void) {
    return this._warnEventHook.on(listener)
  }

  addStaticRule (rule: StaticRule) {
    const existedStaticRule = this._findStaticRule(this._getStaticRuleKey(rule))
    if (existedStaticRule != null) {
      this._warn({
        reason: 'ADD_STATIC_RULE_ALREADY_EXISTED',
        payload: { addedStaticRule: rule, existedStaticRule },
      })
    }

    const conflictedStaticRule = this._findStaticRuleByString(this._getStaticRuleString(rule))
    if (conflictedStaticRule != null) {
      this._warn({
        reason: 'ADD_STATIC_RULE_CONFLICTED_WITH_STATIC_RULE',
        payload: { addedStaticRule: rule, conflictedStaticRule },
      })
    }

    const conflictedDynamicRule = this._findDynamicRuleByString(this._getStaticRuleString(rule))
    if (conflictedDynamicRule != null) {
      this._warn({
        reason: 'ADD_STATIC_RULE_CONFLICTED_WITH_DYNAMIC_RULE',
        payload: { addedStaticRule: rule, conflictedDynamicRule },
      })
    }

    this.staticResolveRulesMap.set(this._getStaticRuleKey(rule), rule)
    return this
  }

  removeStaticRule (key: string) {
    const staticResolveRule = this._findStaticRule(key)
    if (staticResolveRule == null)
      return this

    this.staticResolveRulesMap.delete(key)
    this._resolvedResultsMap.delete(this._getStaticRuleString(staticResolveRule))
    return this
  }

  addDynamicRule (rule: DynamicRule) {
    const isValidDynamicRule = this._validateDynamicRule(rule)
    if (!isValidDynamicRule) {
      this._warn({
        reason: 'ADD_DYNAMIC_RULE_NOT_VALID',
        payload: { addedDynamicRule: rule },
      })
    }

    const existedDynamicRule = this._findDynamicRule(this._getDynamicRuleKey(rule))
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

    this.dynamicResolveRulesMap.set(this._getDynamicRuleKey(rule), rule)
    return this
  }

  removeDynamicRule (key: string) {
    const dynamicResolveRule = this.dynamicResolveRulesMap.get(key)
    if (dynamicResolveRule == null)
      return this

    const matchedResolvedSourceList = Array.from(this._resolvedResultsMap.keys()).filter((source) => this._getDynamicRuleStringPattern(dynamicResolveRule).test(source))
    this.dynamicResolveRulesMap.delete(key)
    matchedResolvedSourceList.forEach((source) => this._resolvedResultsMap.delete(source))
    return this
  }

  resolve (string_: string): ResolvedResult<T> | undefined {
    const existedResult = this._resolvedResultsMap.get(string_)
    if (existedResult != null)
      return existedResult

    const staticResolveRule = this._findStaticRuleByString(string_)
    if (staticResolveRule != null) {
      this._resolvedResultsMap.set(string_, { value: this._getStaticRuleResolved(staticResolveRule) })
      return this.resolve(string_)
    }

    let dynamicResolveRule: DynamicRule | undefined
    let matched: RegExpMatchArray | null | undefined
    for (const rule of this.dynamicResolveRulesMap.values()) {
      matched = string_.match(this._getDynamicRuleStringPattern(rule))
      if (matched != null) {
        dynamicResolveRule = rule
        break
      }
    }
    if (dynamicResolveRule == null || matched == null)
      return undefined

    this._resolvedResultsMap.set(string_, { value: this._getDynamicRuleCreateResolved(dynamicResolveRule)(matched) })

    return this.resolve(string_)
  }

  setResolvedResult (string_: string, resolved: T) {
    const resolvedResult = this._resolvedResultsMap.get(string_)
    if (resolvedResult) {
      resolvedResult.value = resolved
      return
    }

    this._resolvedResultsMap.set(string_, { value: resolved })
  }
}
