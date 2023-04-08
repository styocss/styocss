import { isRegExp } from '@styocss/shared'
import { StyoInstance } from './StyoInstance'
import type {
  FullStyoOptions,
  AtomicStyoRuleSelector,
  StyoPreset,
  MacroStyoRulePartial,
} from './types'

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
