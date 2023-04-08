import { isRegExp } from '@styocss/shared'
import type { StyoPreset, MacroStyoRulePartial } from './types'

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
