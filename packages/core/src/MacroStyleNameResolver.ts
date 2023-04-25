import { isString, StringResolver } from '@styocss/shared'
import type { StyleGroup, MacroStylePartial, StaticMacroStyleRule, DynamicMacroStyleRule, AddedAtomicStyle } from './types'

export class MacroStyleNameResolver<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  _abstractResolver = new StringResolver<MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[], StaticMacroStyleRule<AliasForNested, AliasForSelector, MacroStyleName>, DynamicMacroStyleRule<AliasForNested, AliasForSelector, MacroStyleName>>({
    getStaticRuleKey: (rule) => rule.key,
    getDynamicRuleKey: (rule) => rule.key,
    getStaticRuleString: (rule) => rule.name,
    getStaticRuleResolved: (rule) => rule.partials,
    getDynamicRuleStringPattern: (rule) => rule.pattern,
    getDynamicRuleExampleList: (rule) => rule.exampleList,
    getDynamicRuleCreateResolved: (rule) => rule.createPartials,
  })

  _atomicStyleListMap = new Map<string, AddedAtomicStyle[]>()

  get staticMacroStyleRuleList () {
    return [...this._abstractResolver.staticResolveRulesMap.values()]
  }

  get dynamicMacroStyleRuleList () {
    return [...this._abstractResolver.dynamicResolveRulesMap.values()]
  }

  addStaticMacroStyleRule (staticMacroStyleRule: StaticMacroStyleRule<AliasForNested, AliasForSelector, MacroStyleName>) {
    this._abstractResolver.addStaticRule(staticMacroStyleRule)
  }

  removeStaticMacroStyleRule (key: string) {
    this._abstractResolver.removeStaticRule(key)
  }

  addDynamicMacroStyleRule (dynamicMacroStyleRule: DynamicMacroStyleRule<AliasForNested, AliasForSelector, MacroStyleName>) {
    this._abstractResolver.addDynamicRule(dynamicMacroStyleRule)
  }

  removeDynamicMacroStyleRule (key: string) {
    this._abstractResolver.removeDynamicRule(key)
  }

  _allPartialsAreAtomicStyleGroups (partials: MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[]): partials is StyleGroup<AliasForNested, AliasForSelector, MacroStyleName>[] {
    return partials.every((partial) => !isString(partial))
  }

  _resolveMacroStyleName (macroStyleName: string): MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[] {
    const resolved = this._abstractResolver.resolve(macroStyleName)
    if (resolved == null)
      return []

    const result = resolved.value

    if (this._allPartialsAreAtomicStyleGroups(result))
      return result

    const deeperResult = result
      .flatMap((partial) => {
        if (isString(partial))
          return this._resolveMacroStyleName(partial)

        return partial
      })
    this._abstractResolver.setResolvedResult(macroStyleName, deeperResult)

    return deeperResult
  }

  resolveMacroStyleName (macroStyleName: string): StyleGroup<AliasForNested, AliasForSelector, MacroStyleName>[] {
    const partials = this._resolveMacroStyleName(macroStyleName)

    if (this._allPartialsAreAtomicStyleGroups(partials))
      return partials

    // Should never reach here
    return []
  }
}
