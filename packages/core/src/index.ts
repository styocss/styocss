import { invoke, isRegExp, numberToAlphabets, toKebab, type EventHookListener } from '@styocss/shared'
import { AtomicMacroItemEngine } from '../../atomic-macro-item-engine/src'
import type {
  AtomicStyoRulesDefinition,
  AtomicStyoRuleDefinitionExtractor,
  AtomicStyoRuleContent,
  AtomicStyoRuleNameGetter,
  FullStyoOptions,
  ResolvedStyoOptions,
  MacroStyoRuleNameOrAtomicStyoRulesDefinition,
  CommonStyoOptions,
  MacroStyoRulePartial,
  StyoPreset,
  AtomicStyoRuleSelector,
  RegisteredAtomicStyoRule,
} from './types'

export * from './types'

export class StyoInstance<
  NestedWithTemplateName extends string = never,
  SelectorTemplateName extends string = never,
  MacroUtilityNameOrTemplate extends string = never,
> {
  static #resolveStyoOptions (options: FullStyoOptions): ResolvedStyoOptions {
    const {
      prefix = '',
      defaultNestedWith = '',
      defaultSelector = '.{a}',
      defaultImportant = false,
      presets,
      ...lastPreset
    } = options

    const commonStyoOptionsList: CommonStyoOptions[] = [...(presets || []), lastPreset]

    const resolvedOptions: ResolvedStyoOptions = {
      prefix,
      defaultNestedWith,
      defaultSelector,
      defaultImportant,
      macroStyoRuleDefinitions: commonStyoOptionsList.flatMap(({ macroStyoRuleDefinitions: macroStyoRules }) => {
        if (macroStyoRules == null)
          return []

        return macroStyoRules
      }),
    }

    return resolvedOptions
  }

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

  constructor (options: FullStyoOptions = {}) {
    const {
      prefix,
      defaultNestedWith,
      defaultSelector,
      defaultImportant,
      macroStyoRuleDefinitions,
    } = StyoInstance.#resolveStyoOptions(options)

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

    this.#atomicMacroItemEngine.addMacroItems(macroStyoRuleDefinitions)
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

export class StyoPresetBuilder<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  MacroStyoRuleNameOrTemplate extends string = never,
> {
  #preset: StyoPreset

  constructor (name: string) {
    this.#preset = {
      name,
    }
  }

  registerNestedWithTemplates<T extends string[]> (_template: [...T]): StyoPresetBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroStyoRuleNameOrTemplate>
  registerNestedWithTemplates<T extends string[]> (..._template: [...T]): StyoPresetBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroStyoRuleNameOrTemplate>
  registerNestedWithTemplates<T extends string[]> (..._template: [...T] | [[...T]]): StyoPresetBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroStyoRuleNameOrTemplate> {
    return this
  }

  registerSelectorTemplates<T extends string[]> (_template: [...T]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroStyoRuleNameOrTemplate>
  registerSelectorTemplates<T extends string[]> (..._template: [...T]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroStyoRuleNameOrTemplate>
  registerSelectorTemplates<T extends string[]> (..._template: [...T] | [[...T]]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroStyoRuleNameOrTemplate> {
    return this
  }

  registerMacroStyoRule<N extends string>(name: N, partials: MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>[]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate | N>
  registerMacroStyoRule<T extends string>(pattern: RegExp, createPartials: (matched: string[]) => (MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>)[], template?: T): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate | T>
  registerMacroStyoRule (...args: [name: string, partials: MacroStyoRulePartial[]] | [pattern: RegExp, createPartials: (matched: string[]) => MacroStyoRulePartial[], template?: string]) {
    if (this.#preset.macroStyoRuleDefinitions == null)
      this.#preset.macroStyoRuleDefinitions = []

    if (typeof args[0] === 'string' && Array.isArray(args[1])) {
      const [name, partials] = args
      this.#preset.macroStyoRuleDefinitions.push({ name, partials })
    } else if (isRegExp(args[0]) && typeof args[1] === 'function') {
      const [pattern, createPartials] = args
      this.#preset.macroStyoRuleDefinitions.push({ pattern, createPartials })
    }

    return this
  }

  done (): StyoPreset<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate> {
    return this.#preset
  }
}

export class StyoInstanceBuilder<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  MacroStyoRuleNameOrTemplate extends string = never,
> {
  #styoOptions: FullStyoOptions = {}

  setPrefix (prefix: string) {
    this.#styoOptions.prefix = prefix
    return this
  }

  setDefaultNestedWith (nestedWith: string) {
    this.#styoOptions.defaultNestedWith = nestedWith
    return this
  }

  setDefaultSelector (selector: AtomicStyoRuleSelector) {
    this.#styoOptions.defaultSelector = selector
    return this
  }

  setDefaultImportant (important: boolean) {
    this.#styoOptions.defaultImportant = important
    return this
  }

  usePreset<NestedWithTemplateNameFromPreset extends string, SelectorTemplateNameFromPreset extends string, MacroStyoRuleNameOrTemplateFromPreset extends string>(
    preset: StyoPreset<NestedWithTemplateNameFromPreset, SelectorTemplateNameFromPreset, MacroStyoRuleNameOrTemplateFromPreset>,
  ): StyoInstanceBuilder<NestedWithTemplate | NestedWithTemplateNameFromPreset, SelectorTemplate | SelectorTemplateNameFromPreset, MacroStyoRuleNameOrTemplate | MacroStyoRuleNameOrTemplateFromPreset> {
    if (this.#styoOptions.presets == null)
      this.#styoOptions.presets = []

    this.#styoOptions.presets.push(preset)
    return this
  }

  registerNestedWithTemplates<T extends string[]> (_template: [...T]): StyoInstanceBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroStyoRuleNameOrTemplate>
  registerNestedWithTemplates<T extends string[]> (..._template: [...T]): StyoInstanceBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroStyoRuleNameOrTemplate>
  registerNestedWithTemplates<T extends string[]> (..._template: [...T] | [[...T]]): StyoInstanceBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroStyoRuleNameOrTemplate> {
    return this
  }

  registerSelectorTemplates<T extends string[]> (_template: [...T]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroStyoRuleNameOrTemplate>
  registerSelectorTemplates<T extends string[]> (..._template: [...T]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroStyoRuleNameOrTemplate>
  registerSelectorTemplates<T extends string[]> (..._template: [...T] | [[...T]]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroStyoRuleNameOrTemplate> {
    return this
  }

  registerMacroStyoRule<N extends string>(name: N, partials: MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>[]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate | N>
  registerMacroStyoRule<T extends string>(pattern: RegExp, createPartials: (matched: string[]) => (MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>)[], template?: T): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate | T>
  registerMacroStyoRule (...args: [name: string, partials: MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>[]] | [pattern: RegExp, createPartials: (matched: string[]) => MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>[], template?: string]) {
    if (this.#styoOptions.macroStyoRuleDefinitions == null)
      this.#styoOptions.macroStyoRuleDefinitions = []

    if (typeof args[0] === 'string' && Array.isArray(args[1])) {
      const [name, partials] = args
      this.#styoOptions.macroStyoRuleDefinitions.push({ name, partials })
    } else if (isRegExp(args[0]) && typeof args[1] === 'function') {
      const [pattern, createPartials] = args
      this.#styoOptions.macroStyoRuleDefinitions.push({ pattern, createPartials })
    }

    return this
  }

  done (): StyoInstance<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate> {
    return new StyoInstance(this.#styoOptions)
  }
}

export function createStyoPreset (name: string) {
  return new StyoPresetBuilder(name)
}

export function createStyoInstance () {
  return new StyoInstanceBuilder()
}
