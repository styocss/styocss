import {
  mergeTwoMaps,
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
  preset: StyoPreset

  constructor (name: string) {
    this.preset = {
      name,
      usingPresetNameSet: new Set(),
      nestedWithTemplateMap: new Map(),
      selectorTemplateMap: new Map(),
      registeredMacroStyoRuleMap: new Map(),
    }
  }

  usePreset<NestedWithTemplateNameFromPreset extends string, SelectorTemplateNameFromPreset extends string, StaticMacroStyoRuleNameFromPreset extends string, DynamicMacroStyoRuleNameTemplateMappingFromPreset extends Record<string, string>>(
    preset: StyoPreset<NestedWithTemplateNameFromPreset, SelectorTemplateNameFromPreset, StaticMacroStyoRuleNameFromPreset, DynamicMacroStyoRuleNameTemplateMappingFromPreset>,
  ): StyoPresetBuilder<NestedWithTemplate | NestedWithTemplateNameFromPreset, SelectorTemplate | SelectorTemplateNameFromPreset, StaticMacroStyoRuleName | StaticMacroStyoRuleNameFromPreset, MergeMapping<DynamicMacroStyoRuleNameTemplateMapping, DynamicMacroStyoRuleNameTemplateMappingFromPreset>> {
    this.preset.usingPresetNameSet.delete(preset.name)
    this.preset.usingPresetNameSet.add(preset.name)
    this.preset.nestedWithTemplateMap = mergeTwoMaps(this.preset.nestedWithTemplateMap, preset.nestedWithTemplateMap)
    this.preset.selectorTemplateMap = mergeTwoMaps(this.preset.selectorTemplateMap, preset.selectorTemplateMap)
    this.preset.registeredMacroStyoRuleMap = mergeTwoMaps(this.preset.registeredMacroStyoRuleMap, preset.registeredMacroStyoRuleMap)

    return this
  }

  registerNestedWithTemplates<O extends Record<string, string>, TempK = keyof O, K extends string = TempK extends string ? TempK : never> (templates: O): StyoPresetBuilder<NestedWithTemplate | K, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    const entries = Object.entries(templates) as [string, string][]
    this.preset.nestedWithTemplateMap = mergeTwoMaps(this.preset.nestedWithTemplateMap, new Map(entries))
    return this
  }

  unregisterNestedWithTemplates<T extends NestedWithTemplate[]> (names: [...T]): StyoPresetBuilder<Exclude<NestedWithTemplate, T[number]>, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    names.forEach((name) => this.preset.nestedWithTemplateMap.delete(name as string))
    return this
  }

  registerSelectorTemplates<O extends Record<string, string>, TempK = keyof O, K extends string = TempK extends string ? TempK : never> (templates: O): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate | K, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    const entries = Object.entries(templates) as [string, string][]
    this.preset.selectorTemplateMap = mergeTwoMaps(this.preset.selectorTemplateMap, new Map(entries))
    return this
  }

  unregisterSelectorTemplates<T extends SelectorTemplate[]> (names: [...T]): StyoPresetBuilder<NestedWithTemplate, Exclude<SelectorTemplate, T[number]>, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    names.forEach((name) => this.preset.selectorTemplateMap.delete(name as string))
    return this
  }

  registerStaticMacroStyoRule<N extends string>({
    name,
    partials,
  }: {
    name: N
    partials: MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>>[]
  }): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | N, DynamicMacroStyoRuleNameTemplateMapping> {
    this.preset.registeredMacroStyoRuleMap.delete(name)
    this.preset.registeredMacroStyoRuleMap.set(name, {
      definition: { name, partials },
    })
    return this
  }

  registerDynamicMacroStyoRule<N extends string, T extends string>({
    name,
    pattern,
    template,
    createPartials,
  }: {
    name: N
    pattern: RegExp
    template: T
    createPartials: ((matched: string[]) => (MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>>)[])
  }): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName, SetMapping<DynamicMacroStyoRuleNameTemplateMapping, N, T>> {
    this.preset.registeredMacroStyoRuleMap.delete(name)
    this.preset.registeredMacroStyoRuleMap.set(name, {
      template,
      definition: { pattern, createPartials },
    })
    return this
  }

  unregisterMacroStyoRules<K extends (StaticMacroStyoRuleName | MappingToName<DynamicMacroStyoRuleNameTemplateMapping>)[]>(nameList: [...K]): StyoPresetBuilder<NestedWithTemplate, SelectorTemplate, Exclude<StaticMacroStyoRuleName, K[number]>, TryToRemoveNameFromMapping<DynamicMacroStyoRuleNameTemplateMapping, K[number]>> {
    nameList.forEach((name) => {
      this.preset.registeredMacroStyoRuleMap.delete(name as string)
    })
    return this
  }

  done (): StyoPreset<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    return this.preset
  }
}
