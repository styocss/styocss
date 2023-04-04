import { UtilitiesEngine, type EngineWarning } from '@styocss/utilities-engine'
import { invoke, isRegExp, numberToAlphabets, toKebab, type EventHookListener } from '@styocss/shared'
import type {
  AtomicUtilitiesDefinition,
  AtomicUtilitiesDefinitionExtractor,
  AtomicUtilityContent,
  AtomicUtilityNameGetter,
  StyoOptions,
  ResolvedStyoOptions,
  MacroUtilityNameOrAtomicUtilitiesDefinition,
  StyoCommonOptions,
  MacroUtilityPartial,
  StyoPreset,
  AtomicUtilitySelector,
  RegisteredAtomicUtility,
} from './types'

export * from './types'

export class StyoInstance<
  NestedWithTemplateName extends string = never,
  SelectorTemplateName extends string = never,
  MacroUtilityNameOrTemplate extends string = never,
> {
  static #resolveStyoOptions (options: StyoOptions): ResolvedStyoOptions {
    const {
      atomicUtilityNamePrefix = '',
      defaultAtomicUtilityNestedWith = '',
      defaultAtomicUtilitySelector = '.{u}',
      defaultAtomicUtilityImportant = false,
      presets,
      ...lastPreset
    } = options

    const baseStyoOptionsList: StyoCommonOptions[] = [...(presets || []), lastPreset]

    const resolvedOptions: ResolvedStyoOptions = {
      atomicUtilityNamePrefix,
      defaultAtomicUtilityNestedWith,
      defaultAtomicUtilitySelector,
      defaultAtomicUtilityImportant,
      macroUtilities: baseStyoOptionsList.flatMap(({ macroUtilities }) => {
        if (macroUtilities == null)
          return []

        return macroUtilities
      }),
    }

    return resolvedOptions
  }

  static #createDefaultAtomicUtilitiesDefinitionExtractor ({
    getEngine,
    defaultNestedWith,
    defaultSelector,
    defaultImportant,
  }: {
    getEngine: () => UtilitiesEngine<AtomicUtilitiesDefinition, AtomicUtilityContent>
    defaultNestedWith: string
    defaultSelector: string
    defaultImportant: boolean
  }) {
    const extractor: AtomicUtilitiesDefinitionExtractor = (atomicUtilitiesDefinition) => {
      const applied = invoke((): AtomicUtilitiesDefinition => {
        const { __apply: toBeAppliedMacros = [] } = atomicUtilitiesDefinition
        if (toBeAppliedMacros.length === 0)
          return {}
        let definition: AtomicUtilitiesDefinition = {}
        getEngine().useUtilities(...(toBeAppliedMacros as [string, ...string[]]))
          .forEach(({ content: { nestedWith, selector, important, property, value } }) => {
            definition = {
              ...definition,
              ...(nestedWith != null ? { __nestedWith: nestedWith } : {}),
              ...(selector != null ? { __selector: selector as AtomicUtilitySelector } : {}),
              ...(important != null ? { __important: important } : {}),
              ...((property != null && value != null) ? { [toKebab(property)]: value } : {}),
            }
          })
        return definition
      })
      const rest = invoke((): AtomicUtilitiesDefinition => {
        const {
          __apply,
          __nestedWith,
          __selector,
          __important,
          ...properties
        } = atomicUtilitiesDefinition

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

  static #createDefaultAtomicUtilityNameGetter ({
    prefix = '',
  }: {
    prefix?: string
  } = {}) {
    const existedNoPropertyUtilityNameMap = new Map<string, string>()
    const existedAtomicUtilityNameMap = new Map<string, string>()
    const getter: AtomicUtilityNameGetter = ({ nestedWith, selector, important, property, value }) => {
      const existedNameMap = property == null
        ? existedNoPropertyUtilityNameMap
        : existedAtomicUtilityNameMap
      const serializedString = property == null
        ? `${nestedWith}${selector}${important}`
        : `${nestedWith}${selector}${important}${property}${value}`
      const existedName = existedNameMap.get(serializedString)
      if (existedName != null)
        return existedName

      const num = existedNameMap.size

      const utilityName = property == null
        ? `${prefix}np-${numberToAlphabets(num)}`
        : `${prefix}${numberToAlphabets(num)}`
      existedNameMap.set(serializedString, utilityName)
      return utilityName
    }

    return getter
  }

  #utilitiesEngine: UtilitiesEngine<AtomicUtilitiesDefinition, AtomicUtilityContent>

  constructor (options: StyoOptions = {}) {
    const {
      atomicUtilityNamePrefix,
      defaultAtomicUtilityNestedWith,
      defaultAtomicUtilitySelector,
      defaultAtomicUtilityImportant,
      macroUtilities: macroUtilityDefinitions,
    } = StyoInstance.#resolveStyoOptions(options)

    this.#utilitiesEngine = new UtilitiesEngine<AtomicUtilitiesDefinition, AtomicUtilityContent>({
      atomicUtilitiesDefinitionExtractor: StyoInstance.#createDefaultAtomicUtilitiesDefinitionExtractor({
        getEngine: () => this.#utilitiesEngine,
        defaultNestedWith: defaultAtomicUtilityNestedWith,
        defaultSelector: defaultAtomicUtilitySelector,
        defaultImportant: defaultAtomicUtilityImportant,
      }),
      atomicUtilityNameGetter: StyoInstance.#createDefaultAtomicUtilityNameGetter({
        prefix: atomicUtilityNamePrefix,
      }),
    })

    this.#utilitiesEngine.addMacroUtilities(macroUtilityDefinitions)
  }

  onAtomicUtilityRegistered (fn: EventHookListener<RegisteredAtomicUtility>) {
    return this.#utilitiesEngine.onAtomicUtilityRegistered(fn)
  }

  onWarned (fn: EventHookListener<EngineWarning>) {
    return this.#utilitiesEngine.onWarned(fn)
  }

  #renderUtilitiesCss (): string {
    const lines: string[] = ['/* Utilities */']

    Array.from(this.#utilitiesEngine.registeredAtomicUtilitiesMap.values())
      .forEach(({ name, content: { nestedWith, selector, property, value, important } }) => {
        if (property == null || value == null)
          return

        const body = `${selector.replaceAll('{u}', name)}{${property}:${value}${important ? ' !important' : ''}}`

        if (nestedWith === '') {
          lines.push(body)
          return
        }

        lines.push(`${nestedWith}{${body}}`)
      })

    return lines.join('\n')
  }

  renderCss (): string {
    return [
      this.#renderUtilitiesCss(),
    ].join('\n')
  }

  style (...definitions: [MacroUtilityNameOrAtomicUtilitiesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroUtilityNameOrTemplate>, ...MacroUtilityNameOrAtomicUtilitiesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroUtilityNameOrTemplate>[]]) {
    const utilityNames: string[] = []
    this.#utilitiesEngine.useUtilities(...definitions).forEach(({ name, content: { property, value } }) => {
      if (property == null || value == null)
        return

      utilityNames.push(name)
    })

    return utilityNames
  }
}

export class StyoPresetBuilder<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  MacroUtilityNameOrTemplate extends string = never,
> {
  #preset: StyoPreset

  constructor (name: string) {
    this.#preset = {
      name,
    }
  }

  registerNestedWithTemplates<T extends string[]> (_template: [...T]): StyoPresetBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroUtilityNameOrTemplate>
  registerNestedWithTemplates<T extends string[]> (..._template: [...T]): StyoPresetBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroUtilityNameOrTemplate>
  registerNestedWithTemplates<T extends string[]> (..._template: [...T] | [[...T]]): StyoPresetBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroUtilityNameOrTemplate> {
    return this
  }

  registerSelectorTemplates<T extends string[]> (_template: [...T]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroUtilityNameOrTemplate>
  registerSelectorTemplates<T extends string[]> (..._template: [...T]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroUtilityNameOrTemplate>
  registerSelectorTemplates<T extends string[]> (..._template: [...T] | [[...T]]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroUtilityNameOrTemplate> {
    return this
  }

  registerMacroUtility<N extends string>(name: N, partials: MacroUtilityPartial<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate>[]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate | N>
  registerMacroUtility<T extends string>(pattern: RegExp, createPartials: (matched: string[]) => (MacroUtilityPartial<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate>)[], template?: T): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate | T>
  registerMacroUtility (...args: [name: string, partials: MacroUtilityPartial[]] | [pattern: RegExp, createPartials: (matched: string[]) => MacroUtilityPartial[], template?: string]) {
    if (this.#preset.macroUtilities == null)
      this.#preset.macroUtilities = []

    if (typeof args[0] === 'string' && Array.isArray(args[1])) {
      const [name, partials] = args
      this.#preset.macroUtilities.push({ name, partials })
    } else if (isRegExp(args[0]) && typeof args[1] === 'function') {
      const [pattern, createPartials] = args
      this.#preset.macroUtilities.push({ pattern, createPartials })
    }

    return this
  }

  done (): StyoPreset<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate> {
    return this.#preset
  }
}

export class StyoInstanceBuilder<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  MacroUtilityNameOrTemplate extends string = never,
> {
  #styoOptions: StyoOptions = {}

  setAtomicUtilityNamePrefix (prefix: string) {
    this.#styoOptions.atomicUtilityNamePrefix = prefix
    return this
  }

  setDefaultAtomicUtilityNestedWith (nestedWith: string) {
    this.#styoOptions.defaultAtomicUtilityNestedWith = nestedWith
    return this
  }

  setDefaultAtomicUtilitySelector (selector: AtomicUtilitySelector) {
    this.#styoOptions.defaultAtomicUtilitySelector = selector
    return this
  }

  setDefaultAtomicUtilityImportant (important: boolean) {
    this.#styoOptions.defaultAtomicUtilityImportant = important
    return this
  }

  usePreset<NestedWithTemplateNameFromPreset extends string, SelectorTemplateNameFromPreset extends string, MacroUtilityNameOrTemplateFromPreset extends string>(
    preset: StyoPreset<NestedWithTemplateNameFromPreset, SelectorTemplateNameFromPreset, MacroUtilityNameOrTemplateFromPreset>,
  ): StyoInstanceBuilder<NestedWithTemplate | NestedWithTemplateNameFromPreset, SelectorTemplate | SelectorTemplateNameFromPreset, MacroUtilityNameOrTemplate | MacroUtilityNameOrTemplateFromPreset> {
    if (this.#styoOptions.presets == null)
      this.#styoOptions.presets = []

    this.#styoOptions.presets.push(preset)
    return this
  }

  registerNestedWithTemplates<T extends string[]> (_template: [...T]): StyoInstanceBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroUtilityNameOrTemplate>
  registerNestedWithTemplates<T extends string[]> (..._template: [...T]): StyoInstanceBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroUtilityNameOrTemplate>
  registerNestedWithTemplates<T extends string[]> (..._template: [...T] | [[...T]]): StyoInstanceBuilder<NestedWithTemplate | T[number], SelectorTemplate, MacroUtilityNameOrTemplate> {
    return this
  }

  registerSelectorTemplates<T extends string[]> (_template: [...T]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroUtilityNameOrTemplate>
  registerSelectorTemplates<T extends string[]> (..._template: [...T]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroUtilityNameOrTemplate>
  registerSelectorTemplates<T extends string[]> (..._template: [...T] | [[...T]]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate | T[number], MacroUtilityNameOrTemplate> {
    return this
  }

  registerMacroUtility<N extends string>(name: N, partials: MacroUtilityPartial<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate>[]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate | N>
  registerMacroUtility<T extends string>(pattern: RegExp, createPartials: (matched: string[]) => (MacroUtilityPartial<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate>)[], template?: T): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate | T>
  registerMacroUtility (...args: [name: string, partials: MacroUtilityPartial<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate>[]] | [pattern: RegExp, createPartials: (matched: string[]) => MacroUtilityPartial<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate>[], template?: string]) {
    if (this.#styoOptions.macroUtilities == null)
      this.#styoOptions.macroUtilities = []

    if (typeof args[0] === 'string' && Array.isArray(args[1])) {
      const [name, partials] = args
      this.#styoOptions.macroUtilities.push({ name, partials })
    } else if (isRegExp(args[0]) && typeof args[1] === 'function') {
      const [pattern, createPartials] = args
      this.#styoOptions.macroUtilities.push({ pattern, createPartials })
    }

    return this
  }

  done (): StyoInstance<NestedWithTemplate, SelectorTemplate, MacroUtilityNameOrTemplate> {
    return new StyoInstance(this.#styoOptions)
  }
}

export function createStyoPreset (name: string) {
  return new StyoPresetBuilder(name)
}

export function createStyoInstance () {
  return new StyoInstanceBuilder()
}
