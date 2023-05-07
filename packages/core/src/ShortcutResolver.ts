import { isString } from '@styocss/shared'
import { StringResolver } from './StringResolver'
import type {
  StyleGroup,
  ShortcutPartial,
  StaticShortcutRule,
  DynamicShortcutRule,
} from './types'

class ShortcutResolver<
  AliasForNested extends string,
  AliasTemplateForNested extends string,
  AliasForSelector extends string,
  AliasTemplateForSelector extends string,
  Shortcut extends string,
  ShortcutTemplate extends string,
> {
  private _abstractResolver = new StringResolver<ShortcutPartial<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[], StaticShortcutRule<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>, DynamicShortcutRule<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>>({
    adaptStaticRule: (rule) => ({
      key: rule.key,
      string: rule.name,
      resolved: rule.partials,
    }),
    adaptDynamicRule: (rule) => ({
      key: rule.key,
      stringPattern: rule.pattern,
      predefinedList: rule.predefinedList,
      createResolved: rule.createPartials,
    }),
  })

  get staticShortcutRuleList () {
    return [...this._abstractResolver.staticRulesMap.values()]
  }

  get dynamicShortcutRuleList () {
    return [...this._abstractResolver.dynamicRulesMap.values()]
  }

  addStaticShortcutRule (staticShortcutRule: StaticShortcutRule<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>) {
    this._abstractResolver.addStaticRule(staticShortcutRule)
  }

  removeStaticShortcutRule (key: string) {
    this._abstractResolver.removeStaticRule(key)
  }

  addDynamicShortcutRule (dynamicShortcutRule: DynamicShortcutRule<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>) {
    this._abstractResolver.addDynamicRule(dynamicShortcutRule)
  }

  removeDynamicShortcutRule (key: string) {
    this._abstractResolver.removeDynamicRule(key)
  }

  private _allPartialsAreAtomicStyleGroups (partials: ShortcutPartial<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[]): partials is StyleGroup<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[] {
    return partials.every((partial) => !isString(partial))
  }

  private _resolveShortcut (shortcut: string): ShortcutPartial<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[] {
    const resolved = this._abstractResolver.resolve(shortcut)
    if (resolved == null)
      return []

    const result = resolved.value

    if (this._allPartialsAreAtomicStyleGroups(result))
      return result

    const deeperResult = result
      .flatMap((partial) => {
        if (isString(partial))
          return this._resolveShortcut(partial)

        return partial
      })
    this._abstractResolver.setResolvedResult(shortcut, deeperResult)

    return deeperResult
  }

  resolveShortcut (shortcut: string): StyleGroup<AliasForNested, AliasTemplateForNested, AliasForSelector, AliasTemplateForSelector, Shortcut, ShortcutTemplate>[] {
    const partials = this._resolveShortcut(shortcut)

    if (this._allPartialsAreAtomicStyleGroups(partials))
      return partials

    // Should never reach here
    return []
  }
}

export {
  ShortcutResolver,
}
