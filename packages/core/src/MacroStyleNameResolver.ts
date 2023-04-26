import { isString } from '@styocss/shared'
import { StringResolver } from './StringResolver'
import type {
  StyleGroup,
  MacroStylePartial,
  StaticMacroStyleRule,
  DynamicMacroStyleRule,
  AddedAtomicStyle,
} from './types'

class MacroStyleNameResolver<
  AliasForNested extends string,
  AliasForSelector extends string,
  MacroStyleName extends string,
> {
  private _abstractResolver = new StringResolver<MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[], StaticMacroStyleRule<AliasForNested, AliasForSelector, MacroStyleName>, DynamicMacroStyleRule<AliasForNested, AliasForSelector, MacroStyleName>>({
    adaptStaticRule: (rule) => ({
      key: rule.key,
      string: rule.name,
      resolved: rule.partials,
    }),
    adaptDynamicRule: (rule) => ({
      key: rule.key,
      stringPattern: rule.pattern,
      exampleList: rule.exampleList,
      createResolved: rule.createPartials,
    }),
  })

  private _atomicStyleListMap = new Map<string, AddedAtomicStyle[]>()

  get staticMacroStyleRuleList () {
    return [...this._abstractResolver.staticRulesMap.values()]
  }

  get dynamicMacroStyleRuleList () {
    return [...this._abstractResolver.dynamicRulesMap.values()]
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

  private _allPartialsAreAtomicStyleGroups (partials: MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[]): partials is StyleGroup<AliasForNested, AliasForSelector, MacroStyleName>[] {
    return partials.every((partial) => !isString(partial))
  }

  private _resolveMacroStyleName (macroStyleName: string): MacroStylePartial<AliasForNested, AliasForSelector, MacroStyleName>[] {
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

export {
  MacroStyleNameResolver,
}
