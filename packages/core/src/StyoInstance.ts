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
  AtomicStyoRuleSelector,
  RegisteredAtomicStyoRule,
  RegisteredMacroStyoRuleMap,
} from './types'

export class StyoInstance<
  NestedWithTemplateName extends string = never,
  SelectorTemplateName extends string = never,
  MacroUtilityNameOrTemplate extends string = never,
> {
  static #createAtomicStyoRulesDefinitionExtractor ({
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
      const applied = invoke((): AtomicStyoRulesDefinition => {
        const { __apply: toBeAppliedMacroStyoRules = [] } = atomicStyoRulesDefinition
        if (toBeAppliedMacroStyoRules.length === 0)
          return {}
        let definition: AtomicStyoRulesDefinition = {}
        getEngine().useAtomicItems(...(toBeAppliedMacroStyoRules as [string, ...string[]]))
          .forEach(({ content: { nestedWith, selector, important, property, value } }) => {
            definition = {
              ...definition,
              ...(nestedWith != null ? { __nestedWith: nestedWith } : {}),
              ...(selector != null ? { __selector: selector as AtomicStyoRuleSelector } : {}),
              ...(important != null ? { __important: important } : {}),
              ...((property != null && value != null) ? { [toKebab(property)]: value } : {}),
            }
          })
        return definition
      })
      const rest = invoke((): AtomicStyoRulesDefinition => {
        const {
          __apply,
          __nestedWith,
          __selector,
          __important,
          ...properties
        } = atomicStyoRulesDefinition

        return {
          ...(__nestedWith != null ? { __nestedWith } : {}),
          ...(__selector != null ? { __selector } : {}),
          ...(__important != null ? { __important } : {}),
          ...Object.fromEntries(
            Object.entries(properties).map(([property, value]) => [toKebab(property), value]),
          ),
        }
      })

      const {
        __nestedWith: nestedWith = defaultNestedWith,
        __selector: selector = defaultSelector,
        __important: important = defaultImportant,
        ...properties
      } = {
        ...applied,
        ...rest,
      }

      const propertyEntries = Object.entries(properties)

      if (propertyEntries.length === 0) {
        return [
          {
            nestedWith,
            selector,
            important,
          },
        ]
      }

      return propertyEntries
        .filter(([_property, value]) => value != null)
        .map(([property, value]) => ({
          nestedWith,
          selector,
          important,
          property,
          value,
        }))
    }

    return extractor
  }

  static #createAtomicStyoRuleNameGetter ({
    prefix = '',
  }: {
    prefix?: string
  } = {}) {
    const existedNoPropertyStyoRuleNameMap = new Map<string, string>()
    const existedAtomicStyoRuleNameMap = new Map<string, string>()
    const getter: AtomicStyoRuleNameGetter = ({ nestedWith, selector, important, property, value }) => {
      const existedNameMap = property == null
        ? existedNoPropertyStyoRuleNameMap
        : existedAtomicStyoRuleNameMap
      const serializedString = property == null
        ? `${nestedWith}${selector}${important}`
        : `${nestedWith}${selector}${important}${property}${value}`
      const existedName = existedNameMap.get(serializedString)
      if (existedName != null)
        return existedName

      const num = existedNameMap.size

      const styoRuleName = property == null
        ? `${prefix}np-${numberToAlphabets(num)}`
        : `${prefix}${numberToAlphabets(num)}`
      existedNameMap.set(serializedString, styoRuleName)
      return styoRuleName
    }

    return getter
  }

  #atomicMacroItemEngine: AtomicMacroItemEngine<AtomicStyoRulesDefinition, AtomicStyoRuleContent>

  #usingPresetNameSet: Set<string>
  get usingPresetNames () {
    return [...this.#usingPresetNameSet]
  }

  #nestedWithTemplateSet: Set<string>
  get nestedWithTemplateSet () {
    return [...this.#nestedWithTemplateSet]
  }

  #selectorTemplateSet: Set<string>
  get selectorTemplateSet () {
    return [...this.#selectorTemplateSet]
  }

  #registeredMacroStyoRuleMap: RegisteredMacroStyoRuleMap
  get registeredMacroStyoRuleNames () {
    return [...this.#registeredMacroStyoRuleMap.keys()]
  }

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

    this.#usingPresetNameSet = usingPresetNameSet
    this.#nestedWithTemplateSet = nestedWithTemplateSet
    this.#selectorTemplateSet = selectorTemplateSet
    this.#registeredMacroStyoRuleMap = registeredMacroStyoRuleMap

    this.#atomicMacroItemEngine = new AtomicMacroItemEngine<AtomicStyoRulesDefinition, AtomicStyoRuleContent>({
      atomicItemsDefinitionExtractor: StyoInstance.#createAtomicStyoRulesDefinitionExtractor({
        getEngine: () => this.#atomicMacroItemEngine,
        defaultNestedWith,
        defaultSelector,
        defaultImportant,
      }),
      atomicItemNameGetter: StyoInstance.#createAtomicStyoRuleNameGetter({
        prefix,
      }),
    })

    this.#atomicMacroItemEngine.addMacroItems(
      Array.from(registeredMacroStyoRuleMap.values(), ({ definition }) => definition),
    )
  }

  onAtomicStyoRuleRegistered (fn: EventHookListener<{
    css: string
    registeredAtomicStyoRule: RegisteredAtomicStyoRule
  }>) {
    const wrappedFn: EventHookListener<RegisteredAtomicStyoRule> = (registeredAtomicStyoRule) => {
      const css = this.#renderSingleAtomicStyoRuleCss(registeredAtomicStyoRule)

      if (css === '')
        return

      fn({ css, registeredAtomicStyoRule })
    }
    return this.#atomicMacroItemEngine.onAtomicItemRegistered(wrappedFn)
  }

  // TODO: implement
  // onWarned (fn: EventHookListener<EngineWarning>) {
  //   return this.#atomicMacroItemEngine.onWarned(fn)
  // }

  #renderSingleAtomicStyoRuleCss ({ name, content: { nestedWith, selector, property, value, important } }: RegisteredAtomicStyoRule): string {
    if (property == null || value == null)
      return ''

    const body = `${selector.replaceAll('{a}', name)}{${property}:${value}${important ? ' !important' : ''}}`

    if (nestedWith === '')
      return body

    return `${nestedWith}{${body}}`
  }

  #renderAtomicStyoRulesCss (): string {
    const lines: string[] = ['/* AtomicStyoRule */']

    Array.from(this.#atomicMacroItemEngine.registeredAtomicItemsMap.values())
      .forEach((atomicStyoRule) => {
        const css = this.#renderSingleAtomicStyoRuleCss(atomicStyoRule)

        if (css === '')
          return

        lines.push(this.#renderSingleAtomicStyoRuleCss(atomicStyoRule))
      })

    return lines.join('\n')
  }

  renderCss (): string {
    return [
      this.#renderAtomicStyoRulesCss(),
    ].join('\n')
  }

  style (...definitions: [
    MacroStyoRuleNameOrAtomicStyoRulesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroUtilityNameOrTemplate>,
    ...MacroStyoRuleNameOrAtomicStyoRulesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroUtilityNameOrTemplate>[],
  ]) {
    const atomicStyoRuleNames: string[] = []
    this.#atomicMacroItemEngine.useAtomicItems(...definitions).forEach(({ name, content: { property, value } }) => {
      if (property == null || value == null)
        return

      atomicStyoRuleNames.push(name)
    })

    return atomicStyoRuleNames
  }
}
