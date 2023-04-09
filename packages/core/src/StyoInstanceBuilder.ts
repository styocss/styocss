import {
  isArray,
  isFunction,
  isRegExp,
  isString,
  mergeTwoMaps,
  mergeTwoSets,
} from '@styocss/shared'
import { StyoInstance } from './StyoInstance'
import type {
  FullStyoOptions,
  AtomicStyoRuleSelector,
  StyoPreset,
  MacroStyoRulePartial,
  MappingToTemplate,
  SetMapping,
  MergeMapping,
  MappingToName,
  TryToRemoveNameFromMapping,
} from './types'

export class StyoInstanceBuilder<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  StaticMacroStyoRuleName extends string = never,
  DynamicMacroStyoRuleNameTemplateMapping = {},
> {
  #styoOptions: FullStyoOptions = {
    prefix: '',
    defaultNestedWith: '',
    defaultSelector: '.{a}',
    defaultImportant: false,
    usingPresetNameSet: new Set(),
    nestedWithTemplateSet: new Set(),
    selectorTemplateSet: new Set(),
    registeredMacroStyoRuleMap: new Map(),
  }

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

  usePreset<NestedWithTemplateNameFromPreset extends string, SelectorTemplateNameFromPreset extends string, StaticMacroStyoRuleNameFromPreset extends string, DynamicMacroStyoRuleNameTemplateMappingFromPreset extends Record<string, string>>(
    preset: StyoPreset<NestedWithTemplateNameFromPreset, SelectorTemplateNameFromPreset, StaticMacroStyoRuleNameFromPreset, DynamicMacroStyoRuleNameTemplateMappingFromPreset>,
  ): StyoInstanceBuilder<NestedWithTemplate | NestedWithTemplateNameFromPreset, SelectorTemplate | SelectorTemplateNameFromPreset, StaticMacroStyoRuleName | StaticMacroStyoRuleNameFromPreset, MergeMapping<DynamicMacroStyoRuleNameTemplateMapping, DynamicMacroStyoRuleNameTemplateMappingFromPreset>> {
    this.#styoOptions.usingPresetNameSet.delete(preset.name)
    this.#styoOptions.usingPresetNameSet.add(preset.name)
    this.#styoOptions.nestedWithTemplateSet = mergeTwoSets(this.#styoOptions.nestedWithTemplateSet, preset.nestedWithTemplateSet)
    this.#styoOptions.selectorTemplateSet = mergeTwoSets(this.#styoOptions.selectorTemplateSet, preset.selectorTemplateSet)
    this.#styoOptions.registeredMacroStyoRuleMap = mergeTwoMaps(this.#styoOptions.registeredMacroStyoRuleMap, preset.registeredMacroStyoRuleMap)

    return this
  }

  registerNestedWithTemplates<T extends string[]> (templates: [...T]): StyoInstanceBuilder<NestedWithTemplate | T[number], SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    this.#styoOptions.nestedWithTemplateSet = mergeTwoSets(this.#styoOptions.nestedWithTemplateSet, new Set(templates as string[]))
    return this
  }

  unregisterNestedWithTemplates<T extends NestedWithTemplate[]> (templates: [...T]): StyoInstanceBuilder<Exclude<NestedWithTemplate, T[number]>, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    templates.forEach((template) => this.#styoOptions.nestedWithTemplateSet.delete(template as string))
    return this
  }

  registerSelectorTemplates<T extends string[]> (templates: [...T]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate | T[number], StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    this.#styoOptions.selectorTemplateSet = mergeTwoSets(this.#styoOptions.selectorTemplateSet, new Set(templates as string[]))
    return this
  }

  unregisterSelectorTemplates<T extends SelectorTemplate[]> (templates: [...T]): StyoInstanceBuilder<NestedWithTemplate, Exclude<SelectorTemplate, T[number]>, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    templates.forEach((template) => this.#styoOptions.selectorTemplateSet.delete(template as string))
    return this
  }

  registerMacroStyoRule<N extends string>(name: N, partials: MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>>[]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | N, DynamicMacroStyoRuleNameTemplateMapping>
  registerMacroStyoRule<N extends string, T extends string>(name: N, pattern: RegExp, template: T, createPartials: (matched: string[]) => ((MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>>)[])): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName, SetMapping<DynamicMacroStyoRuleNameTemplateMapping, N, T>>
  registerMacroStyoRule (...args: [name: string, partials: MacroStyoRulePartial[]] | [name: string, pattern: RegExp, template: string, createPartials: (matched: string[]) => MacroStyoRulePartial[]]) {
    if (isString(args[0]) && isArray(args[1])) {
      const [name, partials] = args
      this.#styoOptions.registeredMacroStyoRuleMap.delete(name)
      this.#styoOptions.registeredMacroStyoRuleMap.set(name, {
        definition: { name, partials },
      })
    } else if (isString(args[0]) && isRegExp(args[1]) && isString(args[2]) && isFunction(args[3])) {
      const [name, pattern, template, createPartials] = args
      this.#styoOptions.registeredMacroStyoRuleMap.delete(name)
      this.#styoOptions.registeredMacroStyoRuleMap.set(name, {
        template,
        definition: { pattern, createPartials },
      })
    }

    return this
  }

  unregisterMacroStyoRules<K extends (StaticMacroStyoRuleName | MappingToName<DynamicMacroStyoRuleNameTemplateMapping>)[]>(nameList: [...K]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, Exclude<StaticMacroStyoRuleName, K[number]>, TryToRemoveNameFromMapping<DynamicMacroStyoRuleNameTemplateMapping, K[number]>> {
    nameList.forEach((name) => {
      this.#styoOptions.registeredMacroStyoRuleMap.delete(name as string)
    })
    return this
  }

  done (): StyoInstance<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>> {
    return new StyoInstance(this.#styoOptions)
  }
}
