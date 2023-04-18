import {
  numberToAlphabets,
  toKebab,
} from '@styocss/shared'
import type {
  EventHookListener,
} from '@styocss/shared'
import { AtomicMacroItemEngine } from '../../atomic-macro-item-engine/src'
import type {
  AtomicStyoRulesDefinition,
  AtomicStyoRuleDefinitionExtractor,
  AtomicStyoRuleContent,
  AtomicStyoRuleNameGetter,
  FullStyoOptions,
  MacroStyoRuleNameOrAtomicStyoRulesDefinition,
  RegisteredAtomicStyoRuleObject,
  RegisteredMacroStyoRuleObjectMap,
} from './types'

export const ATOMIC_STYO_RULE_NAME_PLACEHOLDER = '{a}'
export const ATOMIC_STYO_RULE_NAME_PLACEHOLDER_RE_GLOBAL = /\{a\}/g

export const DEFAULT_SELECTOR_PLACEHOLDER = '{s}'
export const DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL = /\{s\}/g

export class StyoInstance<
  NestedWithTemplateName extends string = never,
  SelectorTemplateName extends string = never,
  MacroUtilityNameOrTemplate extends string = never,
> {
  static _createAtomicStyoRulesDefinitionExtractor ({
    defaultNestedWith,
    defaultSelector,
    defaultImportant,
    nestedWithTemplateMap,
    selectorTemplateMap,
  }: {
    defaultNestedWith: string
    defaultSelector: string
    defaultImportant: boolean
    nestedWithTemplateMap: Map<string, string>
    selectorTemplateMap: Map<string, string>
  }) {
    function patchSelectorPlaceholder (selector: string) {
      return (selector.includes(ATOMIC_STYO_RULE_NAME_PLACEHOLDER) || selector.includes(DEFAULT_SELECTOR_PLACEHOLDER))
        ? selector
        : `${DEFAULT_SELECTOR_PLACEHOLDER}${selector}`
    }

    const extractor: AtomicStyoRuleDefinitionExtractor = (atomicStyoRulesDefinition) => {
      const {
        $nestedWith: nestedWith,
        $selector: selector,
        $important: important,
        ...rawProperties
      } = atomicStyoRulesDefinition

      if (Object.keys(rawProperties).length === 0)
        throw new Error('No properties defined')

      const propertyEntries = Object.entries(Object.fromEntries(Object.entries(rawProperties).map(([property, value]) => [toKebab(property), value])))

      // Handle cases where properties are defined
      const finalNestedWith = nestedWith != null
        ? nestedWithTemplateMap.has(nestedWith)
          ? nestedWithTemplateMap.get(nestedWith)!
          : nestedWith
        : defaultNestedWith

      const finalSelector = selector != null
        ? patchSelectorPlaceholder(
          selectorTemplateMap.has(selector)
            ? selectorTemplateMap.get(selector)!
            : selector,
        )
          .replace(DEFAULT_SELECTOR_PLACEHOLDER_RE_GLOBAL, defaultSelector)
        : defaultSelector

      const finalImportant = important != null ? important : defaultImportant

      return propertyEntries
        .map(([property, value]) => ({
          nestedWith: finalNestedWith,
          selector: finalSelector,
          important: finalImportant,
          property,
          value,
        }))
    }

    return extractor
  }

  static _createAtomicStyoRuleNameGetter ({
    prefix = '',
  }: {
    prefix?: string
  } = {}) {
    const existedNameMap = new Map<string, string>()
    const getter: AtomicStyoRuleNameGetter = ({ nestedWith, selector, important, property, value }) => {
      if (property == null)
        throw new Error('Property is required')

      const serializedString = JSON.stringify({
        nestedWith: nestedWith == null ? undefined : nestedWith,
        selector: selector == null ? undefined : selector,
        important: important == null ? undefined : important,
        property: property == null ? undefined : property,
        value: value == null ? undefined : value,
      })

      const existedName = existedNameMap.get(serializedString)
      if (existedName != null)
        return existedName

      const num = existedNameMap.size

      const styoRuleName = `${prefix}${numberToAlphabets(num)}`

      existedNameMap.set(serializedString, styoRuleName)
      return styoRuleName
    }

    return getter
  }

  _atomicMacroItemEngine: AtomicMacroItemEngine<AtomicStyoRulesDefinition, AtomicStyoRuleContent>

  prefix: string
  defaultNestedWith: string
  defaultSelector: string
  defaultImportant: boolean
  usingPresetNameSet: Set<string>
  nestedWithTemplateMap: Map<string, string>
  selectorTemplateMap: Map<string, string>
  registeredMacroStyoRuleMap: RegisteredMacroStyoRuleObjectMap

  constructor (options: FullStyoOptions) {
    const {
      prefix,
      defaultNestedWith,
      defaultSelector,
      defaultImportant,
      usingPresetNameSet,
      nestedWithTemplateMap,
      selectorTemplateMap,
      registeredMacroStyoRuleMap,
    } = options

    this.prefix = prefix
    this.defaultNestedWith = defaultNestedWith
    this.defaultSelector = defaultSelector
    this.defaultImportant = defaultImportant
    this.usingPresetNameSet = usingPresetNameSet
    this.nestedWithTemplateMap = nestedWithTemplateMap
    this.selectorTemplateMap = selectorTemplateMap
    this.registeredMacroStyoRuleMap = registeredMacroStyoRuleMap

    this._atomicMacroItemEngine = new AtomicMacroItemEngine<AtomicStyoRulesDefinition, AtomicStyoRuleContent>({
      atomicItemsDefinitionExtractor: StyoInstance._createAtomicStyoRulesDefinitionExtractor({
        defaultNestedWith,
        defaultSelector,
        defaultImportant,
        nestedWithTemplateMap,
        selectorTemplateMap,
      }),
      atomicItemNameGetter: StyoInstance._createAtomicStyoRuleNameGetter({
        prefix,
      }),
    })

    this._atomicMacroItemEngine.addMacroItems(
      Array.from(registeredMacroStyoRuleMap.values(), ({ definition }) => definition),
    )
  }

  get registeredAtomicStyoRuleMap (): Map<string, RegisteredAtomicStyoRuleObject> {
    return new Map(this._atomicMacroItemEngine.registeredAtomicItemMap)
  }

  onAtomicStyoRuleRegistered (listener: EventHookListener<RegisteredAtomicStyoRuleObject>) {
    return this._atomicMacroItemEngine.onAtomicItemRegistered(listener)
  }

  // TODO: implement warning
  // onWarned (fn: EventHookListener<EngineWarning>) {
  //   return this.#atomicMacroItemEngine.onWarned(fn)
  // }

  style (...definitions: [
    MacroStyoRuleNameOrAtomicStyoRulesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroUtilityNameOrTemplate>,
    ...MacroStyoRuleNameOrAtomicStyoRulesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroUtilityNameOrTemplate>[],
  ]) {
    return this._atomicMacroItemEngine.useAtomicItems(...definitions).map(({ name }) => name)
  }
}
