import type * as CSS from 'csstype'

interface CSSVariables {
  [K: `--${string}`]: (string & {}) | number
}
export interface Properties extends CSS.Properties, CSS.PropertiesHyphen, CSSVariables {}

export type AtomicStyoRuleSelector = `${any}{a}${any}`
export interface AtomicStyoRulesDefinition<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> extends Properties {
  __apply?: MacroStyoRuleNameOrTemplate[]
  __nestedWith?: (string & {}) | NestedWithTemplate
  __selector?: (string & {}) | (SelectorTemplate extends AtomicStyoRuleSelector ? SelectorTemplate : never)
  __important?: boolean
}

export interface AtomicStyoRuleContent {
  nestedWith: string
  selector: string
  important: boolean
  property?: string
  value?: unknown
}

export type MacroStyoRuleNameOrAtomicStyoRulesDefinition<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> = Omit<(string & {}), keyof InstanceType<typeof String>> | MacroStyoRuleNameOrTemplate | AtomicStyoRulesDefinition<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate>

export type MacroStyoRulePartial<
  NestedWithTemplateName extends string = string,
  SelectorTemplateName extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> = MacroStyoRuleNameOrAtomicStyoRulesDefinition<NestedWithTemplateName, SelectorTemplateName, MacroStyoRuleNameOrTemplate>

export type MacroStyoRuleDefinition = import('../../atomic-macro-item-engine/src').MacroItemDefinition<AtomicStyoRulesDefinition>

export type AtomicStyoRuleDefinitionExtractor = import('../../atomic-macro-item-engine/src').AtomicItemsDefinitionExtractor<AtomicStyoRulesDefinition, AtomicStyoRuleContent>

export type AtomicStyoRuleNameGetter = import('../../atomic-macro-item-engine/src').AtomicItemNameGetter<AtomicStyoRuleContent>

export type RegisteredAtomicStyoRule = import('../../atomic-macro-item-engine/src').RegisteredAtomicItem<AtomicStyoRuleContent>

export interface CommonStyoOptions<
  // Just for typescript autocompletion
  /* eslint-disable @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars */
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
  /* eslint-enable @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars */
> {
  /**
   * @default
   * ```ts
   * []
   * ```
   */
  macroStyoRuleDefinitions?: MacroStyoRuleDefinition[]
}

export interface StyoPreset<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> extends CommonStyoOptions<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate> {
  name: string
}

export interface FullStyoOptions<
  NestedWithTemplate extends string = string,
  SelectorTemplate extends string = string,
  MacroStyoRuleNameOrTemplate extends string = string,
> extends CommonStyoOptions<NestedWithTemplate, SelectorTemplate, MacroStyoRuleNameOrTemplate> {
  /**
   * @default
   * ```ts
   * ''
   * ```
   */
  prefix?: string

  /**
   * @default
   * ```ts
   * ''
   * ```
   */
  defaultNestedWith?: string

  /**
   * @default
   * ```ts
   * '.{a}'
   * ```
   */
  defaultSelector?: string

  /**
   * @default
   * ```ts
   * false
   * ```
   */
  defaultImportant?: boolean

  /**
   * @default
   * ```ts
   * []
   * ```
   */
  presets?: StyoPreset[]
}
export type ResolvedStyoOptions = Required<Omit<FullStyoOptions, 'presets'>>
