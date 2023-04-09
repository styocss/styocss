import {
  isArray,
  isFunction,
  isRegExp,
  isString,
  mergeTwoMaps,
  mergeTwoSets,
} from '@styocss/shared'
import type {
  StyoPreset,
  MacroStyoRulePartial,
  MappingToName,
  MappingToTemplate,
  SetMapping,
  TryToRemoveNameFromMapping,
  MergeMapping,
} from './types'

export class StyoPresetBuilder<
  NestedWithTemplate extends string = never,
  SelectorTemplate extends string = never,
  StaticMacroStyoRuleName extends string = never,
  DynamicMacroStyoRuleNameTemplateMapping = {},
> {
  #preset: StyoPreset

  constructor (name: string) {
    this.#preset = {
      name,
      usingPresetNameSet: new Set(),
      nestedWithTemplateSet: new Set(),
      selectorTemplateSet: new Set(),
      registeredMacroStyoRuleMap: new Map(),
    }
  }

  usePreset<NestedWithTemplateNameFromPreset extends string, SelectorTemplateNameFromPreset extends string, StaticMacroStyoRuleNameFromPreset extends string, DynamicMacroStyoRuleNameTemplateMappingFromPreset extends Record<string, string>>(
    preset: StyoPreset<NestedWithTemplateNameFromPreset, SelectorTemplateNameFromPreset, StaticMacroStyoRuleNameFromPreset, DynamicMacroStyoRuleNameTemplateMappingFromPreset>,
  ): StyoPresetBuilder<NestedWithTemplate | NestedWithTemplateNameFromPreset, SelectorTemplate | SelectorTemplateNameFromPreset, StaticMacroStyoRuleName | StaticMacroStyoRuleNameFromPreset, MergeMapping<DynamicMacroStyoRuleNameTemplateMapping, DynamicMacroStyoRuleNameTemplateMappingFromPreset>> {
    this.#preset.usingPresetNameSet.delete(preset.name)
    this.#preset.usingPresetNameSet.add(preset.name)
    this.#preset.nestedWithTemplateSet = mergeTwoSets(this.#preset.nestedWithTemplateSet, preset.nestedWithTemplateSet)
    this.#preset.selectorTemplateSet = mergeTwoSets(this.#preset.selectorTemplateSet, preset.selectorTemplateSet)
    this.#preset.registeredMacroStyoRuleMap = mergeTwoMaps(this.#preset.registeredMacroStyoRuleMap, preset.registeredMacroStyoRuleMap)

    return this
  }

  registerNestedWithTemplates<T extends string[]> (templates: [...T]): StyoPresetBuilder<NestedWithTemplate | T[number], SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    this.#preset.nestedWithTemplateSet = mergeTwoSets(this.#preset.nestedWithTemplateSet, new Set(templates as string[]))
    return this
  }

  unregisterNestedWithTemplates<T extends NestedWithTemplate[]> (templates: [...T]): StyoPresetBuilder<Exclude<NestedWithTemplate, T[number]>, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    templates.forEach((template) => this.#preset.nestedWithTemplateSet.delete(template as string))
    return this
  }

  registerSelectorTemplates<T extends string[]> (templates: [...T]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate | T[number], StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    this.#preset.selectorTemplateSet = mergeTwoSets(this.#preset.selectorTemplateSet, new Set(templates as string[]))
    return this
  }

  unregisterSelectorTemplates<T extends SelectorTemplate[]> (templates: [...T]): StyoPresetBuilder<NestedWithTemplate, Exclude<SelectorTemplate, T[number]>, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    templates.forEach((template) => this.#preset.selectorTemplateSet.delete(template as string))
    return this
  }

  registerMacroStyoRule<N extends string>(name: N, partials: MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>>[]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | N, DynamicMacroStyoRuleNameTemplateMapping>
  registerMacroStyoRule<N extends string, T extends string>(name: N, pattern: RegExp, template: T, createPartials: ((matched: string[]) => (MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>>)[])): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName, SetMapping<DynamicMacroStyoRuleNameTemplateMapping, N, T>>
  registerMacroStyoRule (...args: [name: string, partials: MacroStyoRulePartial[]] | [name: string, pattern: RegExp, template: string, createPartials: ((matched: string[]) => MacroStyoRulePartial[])]) {
    if (isString(args[0]) && isArray(args[1])) {
      const [name, partials] = args
      this.#preset.registeredMacroStyoRuleMap.delete(name)
      this.#preset.registeredMacroStyoRuleMap.set(name, {
        definition: { name, partials },
      })
    } else if (isString(args[0]) && isRegExp(args[1]) && isString(args[2]) && isFunction(args[3])) {
      const [name, pattern, template, createPartials] = args
      this.#preset.registeredMacroStyoRuleMap.delete(name)
      this.#preset.registeredMacroStyoRuleMap.set(name, {
        template,
        definition: { pattern, createPartials },
      })
    }

    return this
  }

  unregisterMacroStyoRules<K extends (StaticMacroStyoRuleName | MappingToName<DynamicMacroStyoRuleNameTemplateMapping>)[]>(nameList: [...K]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, Exclude<StaticMacroStyoRuleName, K[number]>, TryToRemoveNameFromMapping<DynamicMacroStyoRuleNameTemplateMapping, K[number]>> {
    nameList.forEach((name) => {
      this.#preset.registeredMacroStyoRuleMap.delete(name as string)
    })
    return this
  }

  done (): StyoPreset<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    return this.#preset
  }
}
