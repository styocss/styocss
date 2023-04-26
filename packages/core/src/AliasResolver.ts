import { StringResolver } from './StringResolver'
import type {
  DynamicAliasRule,
  StaticAliasRule,
} from './types'

class AliasResolver<Alias extends string> {
  private _abstractResolver = new StringResolver<string, StaticAliasRule<Alias>, DynamicAliasRule<Alias>>({
    adaptStaticRule: (rule) => ({
      key: rule.key,
      string: rule.alias,
      resolved: rule.value,
    }),
    adaptDynamicRule: (rule) => ({
      key: rule.key,
      stringPattern: rule.pattern,
      exampleList: rule.exampleList,
      createResolved: rule.createValue,
    }),
  })

  get staticAliasRuleList () {
    return [...this._abstractResolver.staticRulesMap.values()]
  }

  get dynamicAliasRuleList () {
    return [...this._abstractResolver.dynamicRulesMap.values()]
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
