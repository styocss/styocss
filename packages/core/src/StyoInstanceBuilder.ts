import {
  isArray,
  isFunction,
  isRegExp,
  isString,
  mergeTwoMaps,
} from '@styocss/shared'
import { StyoInstance } from './StyoInstance'
import type {
  FullStyoOptions,
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
  styoOptions: FullStyoOptions = {
    prefix: '',
    defaultNestedWith: '',
    defaultSelector: '.{a}',
    defaultImportant: false,
    usingPresetNameSet: new Set(),
    nestedWithTemplateMap: new Map(),
    selectorTemplateMap: new Map(),
    registeredMacroStyoRuleMap: new Map(),
  }

  setPrefix (prefix: string) {
    this.styoOptions.prefix = prefix
    return this
  }

  setDefaultNestedWith (nestedWith: string) {
    this.styoOptions.defaultNestedWith = nestedWith
    return this
  }

  setDefaultSelector (selector: `${any}{a}${any}`) {
    this.styoOptions.defaultSelector = selector
    return this
  }

  setDefaultImportant (important: boolean) {
    this.styoOptions.defaultImportant = important
    return this
  }

  usePreset<NestedWithTemplateNameFromPreset extends string, SelectorTemplateNameFromPreset extends string, StaticMacroStyoRuleNameFromPreset extends string, DynamicMacroStyoRuleNameTemplateMappingFromPreset extends Record<string, string>>(
    preset: StyoPreset<NestedWithTemplateNameFromPreset, SelectorTemplateNameFromPreset, StaticMacroStyoRuleNameFromPreset, DynamicMacroStyoRuleNameTemplateMappingFromPreset>,
  ): StyoInstanceBuilder<NestedWithTemplate | NestedWithTemplateNameFromPreset, SelectorTemplate | SelectorTemplateNameFromPreset, StaticMacroStyoRuleName | StaticMacroStyoRuleNameFromPreset, MergeMapping<DynamicMacroStyoRuleNameTemplateMapping, DynamicMacroStyoRuleNameTemplateMappingFromPreset>> {
    this.styoOptions.usingPresetNameSet.delete(preset.name)
    this.styoOptions.usingPresetNameSet.add(preset.name)
    this.styoOptions.nestedWithTemplateMap = mergeTwoMaps(this.styoOptions.nestedWithTemplateMap, preset.nestedWithTemplateMap)
    this.styoOptions.selectorTemplateMap = mergeTwoMaps(this.styoOptions.selectorTemplateMap, preset.selectorTemplateMap)
    this.styoOptions.registeredMacroStyoRuleMap = mergeTwoMaps(this.styoOptions.registeredMacroStyoRuleMap, preset.registeredMacroStyoRuleMap)

    return this
  }

  registerNestedWithTemplates<O extends Record<string, string>, TempK = keyof O, K extends string = TempK extends string ? TempK : never> (templates: O): StyoInstanceBuilder<NestedWithTemplate | K, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    const entries = Object.entries(templates) as [string, string][]
    this.styoOptions.nestedWithTemplateMap = mergeTwoMaps(this.styoOptions.nestedWithTemplateMap, new Map(entries))
    return this
  }

  unregisterNestedWithTemplates<T extends NestedWithTemplate[]> (names: [...T]): StyoInstanceBuilder<Exclude<NestedWithTemplate, T[number]>, SelectorTemplate, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    names.forEach((name) => this.styoOptions.nestedWithTemplateMap.delete(name as string))
    return this
  }

  registerSelectorTemplates<O extends Record<string, string>, TempK = keyof O, K extends string = TempK extends string ? TempK : never> (templates: O): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate | K, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    const entries = Object.entries(templates) as [string, string][]
    this.styoOptions.selectorTemplateMap = mergeTwoMaps(this.styoOptions.selectorTemplateMap, new Map(entries))
    return this
  }

  unregisterSelectorTemplates<T extends SelectorTemplate[]> (names: [...T]): StyoInstanceBuilder<NestedWithTemplate, Exclude<SelectorTemplate, T[number]>, StaticMacroStyoRuleName, DynamicMacroStyoRuleNameTemplateMapping> {
    names.forEach((name) => this.styoOptions.selectorTemplateMap.delete(name as string))
    return this
  }

  registerMacroStyoRule<N extends string>(name: N, partials: MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>>[]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | N, DynamicMacroStyoRuleNameTemplateMapping>
  registerMacroStyoRule<N extends string, T extends string>(name: N, pattern: RegExp, template: T, createPartials: (matched: string[]) => ((MacroStyoRulePartial<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>>)[])): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName, SetMapping<DynamicMacroStyoRuleNameTemplateMapping, N, T>>
  registerMacroStyoRule (...args: [name: string, partials: MacroStyoRulePartial[]] | [name: string, pattern: RegExp, template: string, createPartials: (matched: string[]) => MacroStyoRulePartial[]]) {
    if (isString(args[0]) && isArray(args[1])) {
      const [name, partials] = args
      this.styoOptions.registeredMacroStyoRuleMap.delete(name)
      this.styoOptions.registeredMacroStyoRuleMap.set(name, {
        definition: { name, partials },
      })
    } else if (isString(args[0]) && isRegExp(args[1]) && isString(args[2]) && isFunction(args[3])) {
      const [name, pattern, template, createPartials] = args
      this.styoOptions.registeredMacroStyoRuleMap.delete(name)
      this.styoOptions.registeredMacroStyoRuleMap.set(name, {
        template,
        definition: { pattern, createPartials },
      })
    }

    return this
  }

  unregisterMacroStyoRules<K extends (StaticMacroStyoRuleName | MappingToName<DynamicMacroStyoRuleNameTemplateMapping>)[]>(nameList: [...K]): StyoInstanceBuilder<NestedWithTemplate, SelectorTemplate, Exclude<StaticMacroStyoRuleName, K[number]>, TryToRemoveNameFromMapping<DynamicMacroStyoRuleNameTemplateMapping, K[number]>> {
    nameList.forEach((name) => {
      this.styoOptions.registeredMacroStyoRuleMap.delete(name as string)
    })
    return this
  }

  done (): StyoInstance<NestedWithTemplate, SelectorTemplate, StaticMacroStyoRuleName | MappingToTemplate<DynamicMacroStyoRuleNameTemplateMapping>> {
    return new StyoInstance(this.styoOptions)
  }
}
