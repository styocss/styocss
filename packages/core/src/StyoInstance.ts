import {
  invoke,
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

export class StyoInstance<
  NestedWithTemplateName extends string = never,
  SelectorTemplateName extends string = never,
  MacroUtilityNameOrTemplate extends string = never,
> {
  static _createAtomicStyoRulesDefinitionExtractor ({
    getEngine,
    defaultNestedWith,
    defaultSelector,
    defaultImportant,
  }: {
    getEngine: () => AtomicMacroItemEngine<AtomicStyoRulesDefinition, AtomicStyoRuleContent>
    defaultNestedWith: string
    defaultSelector: string
    defaultImportant: boolean
  }) {
    const extractor: AtomicStyoRuleDefinitionExtractor = (atomicStyoRulesDefinition) => {
      const { $apply } = atomicStyoRulesDefinition
      const resolvedApplyDefinition = ($apply == null || $apply.length === 0)
        ? {}
        : invoke(() => {
          let definition: AtomicStyoRulesDefinition = {}

          $apply.forEach((macroStyoRule) => {
            const registeredAtomicItemList = getEngine().useAtomicItems(macroStyoRule)
            registeredAtomicItemList.forEach(({ content: { nestedWith, selector, important, property, value } }) => {
              definition = {
                ...definition,
                ...(nestedWith != null ? { $nestedWith: nestedWith } : {}),
                ...(selector != null ? { $selector: selector.replace('&', definition.$selector || '&') } : {}),
                ...(important != null ? { $important: important } : {}),
                ...((property != null && value != null) ? { [property]: value } : {}),
              }
            })
          })

          return definition
        })

      const {
        $nestedWith: nestedWithFromApply,
        $selector: selectorFromApply,
        $important: importantFromApply,
        ...propertiesFromApply
      } = resolvedApplyDefinition

      const {
        $apply: _ignoreApply,
        $nestedWith: nestedWith,
        $selector: selector,
        $important: important,
        ..._properties
      } = atomicStyoRulesDefinition

      const properties = Object.fromEntries(Object.entries(_properties).map(([property, value]) => [toKebab(property), value]))

      const propertyEntries = Object.entries({
        ...propertiesFromApply,
        ...properties,
      }).filter(([_property, value]) => value != null)

      // Handle cases where properties are not defined, return a virtual atomic styo rule
      if (propertyEntries.length === 0) {
        const toReturnObj = {
          ...((nestedWithFromApply || nestedWith) != null ? { nestedWith: (nestedWithFromApply || nestedWith) } : {}),
          ...(selectorFromApply != null
            ? { selector: selectorFromApply.replace('&', selector || '&') }
            : (selector != null ? { selector } : {})),
          ...((importantFromApply || important) != null ? { important: (importantFromApply || important) } : {}),
        }

        if (Object.keys(toReturnObj).length === 0)
          return []

        return [toReturnObj]
      }

      // Handle cases where properties are defined
      return propertyEntries
        .map(([property, value]) => ({
          nestedWith: nestedWithFromApply != null
            ? nestedWithFromApply
            : nestedWith != null
              ? nestedWith
              : defaultNestedWith,
          selector: selectorFromApply != null
            ? selectorFromApply.replace('&', selector || '&')
            : selector != null
              ? selector
              : defaultSelector,
          important: importantFromApply != null
            ? importantFromApply
            : important != null
              ? important
              : defaultImportant,
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
    const existedVirtualAtomicStyoRuleNameMap = new Map<string, string>()
    const existedAtomicStyoRuleNameMap = new Map<string, string>()
    const getter: AtomicStyoRuleNameGetter = ({ nestedWith, selector, important, property, value }) => {
      const isVirtual = property == null
      const existedNameMap = isVirtual
        ? existedVirtualAtomicStyoRuleNameMap
        : existedAtomicStyoRuleNameMap
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

      const styoRuleName = isVirtual
        ? `${prefix}virtual-${numberToAlphabets(num)}`
        : `${prefix}${numberToAlphabets(num)}`

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
  nestedWithTemplateSet: Set<string>
  selectorTemplateSet: Set<string>
  registeredMacroStyoRuleMap: RegisteredMacroStyoRuleObjectMap

  constructor (options: FullStyoOptions) {
    const {
      prefix,
      defaultNestedWith,
      defaultSelector,
      defaultImportant,
      usingPresetNameSet,
      nestedWithTemplateSet,
      selectorTemplateSet,
      registeredMacroStyoRuleMap,
    } = options

    this.prefix = prefix
    this.defaultNestedWith = defaultNestedWith
    this.defaultSelector = defaultSelector
    this.defaultImportant = defaultImportant
    this.usingPresetNameSet = usingPresetNameSet
    this.nestedWithTemplateSet = nestedWithTemplateSet
    this.selectorTemplateSet = selectorTemplateSet
    this.registeredMacroStyoRuleMap = registeredMacroStyoRuleMap

    this._atomicMacroItemEngine = new AtomicMacroItemEngine<AtomicStyoRulesDefinition, AtomicStyoRuleContent>({
      atomicItemsDefinitionExtractor: StyoInstance._createAtomicStyoRulesDefinitionExtractor({
        getEngine: () => this._atomicMacroItemEngine,
        defaultNestedWith,
        defaultSelector,
        defaultImportant,
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
    const atomicStyoRuleNames: string[] = []
    this._atomicMacroItemEngine.useAtomicItems(...definitions).forEach(({ name, content: { property, value } }) => {
      if (property == null || value == null)
        return

      atomicStyoRuleNames.push(name)
    })

    return atomicStyoRuleNames
  }
}
