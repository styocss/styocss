import { StringResolver } from '@styocss/shared'
import type {
  DynamicAliasRule,
  StaticAliasRule,
} from './types'

class AliasResolver<Alias extends string> {
  _abstractResolver = new StringResolver<string, StaticAliasRule<Alias>, DynamicAliasRule<Alias>>({
    getStaticRuleKey: (rule) => rule.key,
    getDynamicRuleKey: (rule) => rule.key,
    getStaticRuleString: (rule) => rule.alias,
    getStaticRuleResolved: (rule) => rule.value,
    getDynamicRuleStringPattern: (rule) => rule.pattern,
    getDynamicRuleExampleList: (rule) => rule.exampleList,
    getDynamicRuleCreateResolved: (rule) => rule.createValue,
  })

  get staticAliasRuleList () {
    return [...this._abstractResolver.staticResolveRulesMap.values()]
  }

  get dynamicAliasRuleList () {
    return [...this._abstractResolver.dynamicResolveRulesMap.values()]
  }

  addStaticAliasRule (staticAliasRule: StaticAliasRule<Alias>) {
    this._abstractResolver.addStaticRule(staticAliasRule)
  }

  removeStaticAliasRule (key: string) {
    this._abstractResolver.removeStaticRule(key)
  }

  addDynamicAliasRule (dynamicAliasRule: DynamicAliasRule<Alias>) {
    this._abstractResolver.addDynamicRule(dynamicAliasRule)
  }

  removeDynamicAliasRule (key: string) {
    this._abstractResolver.removeDynamicRule(key)
  }

  resolveAlias (alias: string): string | undefined {
    const resolved = this._abstractResolver.resolve(alias)
    if (resolved == null)
      return undefined

    const result = resolved.value
    const deeperResult = this.resolveAlias(result)

    if (deeperResult != null) {
      this._abstractResolver.setResolvedResult(alias, deeperResult)
      return deeperResult
    }

    return result
  }
}

export {
  AliasResolver,
}
